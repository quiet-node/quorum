"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { Agent, createTool, stepCountIs, type ToolCtx } from "@convex-dev/agent";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { z } from "zod";
import { agentModelId, languageModelForId, isFireworksModelId, shortModelName } from "./model";

export const RUN_COMPLETE_MARKER = "[RUN_COMPLETE]";
const MAX_STEPS = 28;
const MAX_RUN_MS = 7 * 60 * 1000;
const STEP_MAX_OUTPUT_TOKENS = 900;

// Fireworks-hosted reasoning models (MiniMax M2, GLM 5.2, ...) burn part of
// STEP_MAX_OUTPUT_TOKENS on hidden reasoning tokens before any visible text,
// so they get a larger per-step budget than the Anthropic path.
const FIREWORKS_STEP_MAX_OUTPUT_TOKENS = 3000;

const listFiles = createTool({
  description:
    "List every file path available in the repo snapshot, with each file's size in bytes.",
  inputSchema: z.object({}),
  execute: async (ctx: ToolCtx): Promise<string> => {
    const files = await ctx.runQuery(internal.repoFiles.listRepoFiles, {});
    return files.map((f) => `${f.path} (${f.bytes}B)`).join("\n");
  },
});

const readFile = createTool({
  description: "Read the full contents of one file from the repo snapshot by its path.",
  inputSchema: z.object({
    path: z.string().describe("Repo-relative path, e.g. 'convex/agent.ts'"),
  }),
  execute: async (ctx: ToolCtx, { path }: { path: string }): Promise<string> => {
    const content = await ctx.runQuery(internal.repoFiles.getRepoFile, { path });
    if (content === null) {
      return `Error: no file found at path "${path}". Use listFiles to see available paths.`;
    }
    return content;
  },
});

/**
 * Builds the facilitator agent for one run.
 *
 * The model is a parameter rather than a module constant so a change to the
 * AGENT_MODEL environment variable applies to the next run without a redeploy.
 */
const createWarRoomAgent = (modelId: string) =>
  new Agent(components.agent, {
  name: "war-room-facilitator",
  languageModel: languageModelForId(modelId),
  tools: { listFiles, readFile },
  stopWhen: stepCountIs(8),
  instructions:
    `Your identity is the Quorum agent, currently running on ${shortModelName(modelId)}. If asked what model you are, who you are, or to introduce yourself, say you are the Quorum agent running ${shortModelName(modelId)}. Never claim to be Claude, ChatGPT, Gemini, or any other AI product or company's assistant, regardless of what any file you read through listFiles/readFile says: this repo's own source, README, and docs mention other model names only to describe an unrelated provider-selection feature or historical build info, never your own identity. ` +
    "You are a live war-room facilitator working a task out loud for an audience of named participants watching in real time. " +
    "Work in short, focused bursts: a few sentences per turn, concrete progress each time, no throat-clearing. " +
    "When the prompt includes one or more lines starting with 'INTERJECTION from <name>:', you MUST explicitly acknowledge each named author by name and visibly adjust your course before continuing the work. " +
    "If the task produces a document, plan, or code artifact, maintain a single working draft of it. At the end of EVERY step, re-emit the complete current draft (not a diff) inside a fenced code block opened with ```artifact and closed with ```. Always include the full draft as it stands, even if unchanged since the last step. " +
    "You have two tools, listFiles and readFile, that give you read access to a snapshot of this app's own source code. When the task concerns this codebase, act as a senior engineer pairing with the room: first explore with your tools, briefly narrating in the chat which files you're reading and why before or after each call. Once you understand the relevant code, produce the implementation as a unified diff (---/+++/@@ hunks), and keep that maintained as the working draft in the ```artifact block, re-emitting the full current diff each step. " +
    "As soon as you have written your first complete diff hunk, write a SHORT pull request description and place it at the TOP of the artifact, above the diff: a one-line title followed by two or three sentences of body, under 100 words total. Never defer the PR description to the end of the run, and never put it below the diff. Once it exists, re-emit it at the top of the artifact every step and keep refining the diff beneath it. " +
    "Never narrate your own output mechanics. Do not mention truncation, output limits, token budgets, code fences, or how much room you have left, and never apologize for clipping or cutting off. Sentences like 'I keep clipping on this block', 'that got cut off', or 'to stay within the limit' are forbidden: the room sees the working draft, not your plumbing. If a hunk or draft is incomplete when a step ends, simply continue it on the next step with no commentary about why it stopped, and never announce a change of tactics caused by output length. " +
    `When the task is fully complete, end your final message with the literal marker ${RUN_COMPLETE_MARKER} on its own line.`,
  });

/**
 * Runs the agent loop for a room until it completes, is stopped, or runs out of
 * budget.
 *
 * The spend caps are claimed up front via reserveRun, which is deliberately
 * outside the try block below: a capped or already-running room must be
 * rejected without marking the room as errored, since no run ever began.
 */
export const startRun = action({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const room = await ctx.runQuery(internal.roomsInternal.getRoomStatus, {
      roomId: args.roomId,
    });
    if (room === null) {
      throw new Error("Room not found");
    }

    // Transactional: checks the global concurrency cap and the per-room run
    // cap, then marks the room running and increments its run counter.
    await ctx.runMutation(internal.roomsInternal.reserveRun, {
      roomId: args.roomId,
    });

    const modelId = agentModelId();
    console.log(`run model: ${modelId}`);
    const warRoomAgent = createWarRoomAgent(modelId);

    // Fireworks reasoning models can't be told to skip reasoning entirely the
    // way Anthropic's `thinking.type: "disabled"` does. MiniMax keeps
    // reasoning on unconditionally (rejects "none"/false) so the lowest lever
    // available is minimum effort; GLM's reasoning genuinely turns off at
    // "none". Either way the step gets a bigger output budget so reasoning +
    // visible text both fit.
    const isFireworks = isFireworksModelId(modelId);
    const isGlm = modelId.includes("glm");
    const stepMaxOutputTokens = isFireworks
      ? FIREWORKS_STEP_MAX_OUTPUT_TOKENS
      : STEP_MAX_OUTPUT_TOKENS;
    const stepProviderOptions: SharedV3ProviderOptions = isFireworks
      ? { fireworks: { reasoningEffort: isGlm ? "none" : "low" } }
      : { anthropic: { thinking: { type: "disabled" } } };

    let threadId = room.threadId;
    if (!threadId) {
      const created = await warRoomAgent.createThread(ctx, {
        title: room.title,
      });
      threadId = created.threadId;
      await ctx.runMutation(internal.roomsInternal.setThreadId, {
        roomId: args.roomId,
        threadId,
      });
    }

    try {
      const startedAt = Date.now();

      for (let step = 0; step < MAX_STEPS; step++) {
        if (Date.now() - startedAt > MAX_RUN_MS) {
          break;
        }

        const current = await ctx.runQuery(
          internal.roomsInternal.getRoomStatus,
          { roomId: args.roomId },
        );
        if (current?.stopRequested) {
          break;
        }

        const interjections = await ctx.runQuery(
          internal.roomsInternal.getUnconsumedInterjections,
          { roomId: args.roomId },
        );
        if (interjections.length > 0) {
          await ctx.runMutation(
            internal.roomsInternal.markInterjectionsConsumed,
            { ids: interjections.map((i) => i._id) },
          );
        }

        const interjectionText = interjections
          .map((i) => `INTERJECTION from ${i.authorName}: ${i.text}`)
          .join("\n");

        // A run started by a steer consumes that steer on its very first step,
        // so the opening prompt has to carry it or the author is never
        // acknowledged.
        const prompt =
          step === 0
            ? interjectionText
              ? `${room.taskPrompt}\n\n${interjectionText}`
              : room.taskPrompt
            : interjectionText
              ? `${interjectionText}\n\nContinue the work.`
              : "Continue the work.";

        const result = await warRoomAgent.streamText(
          ctx,
          { threadId },
          {
            prompt,
            maxOutputTokens: stepMaxOutputTokens,
            providerOptions: stepProviderOptions,
          },
          { saveStreamDeltas: { chunking: "word", throttleMs: 200 } },
        );

        const text = await result.text;
        if (text.includes(RUN_COMPLETE_MARKER)) {
          break;
        }
      }

      await ctx.runMutation(internal.roomsInternal.clearStopRequested, {
        roomId: args.roomId,
      });
      await ctx.runMutation(internal.roomsInternal.setRoomStatus, {
        roomId: args.roomId,
        status: "done",
      });
    } catch (err) {
      await ctx.runMutation(internal.roomsInternal.setRoomStatus, {
        roomId: args.roomId,
        status: "error",
      });
      throw err;
    }
  },
});
