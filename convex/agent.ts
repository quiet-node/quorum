"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";

export const RUN_COMPLETE_MARKER = "[RUN_COMPLETE]";
const MAX_STEPS = 20;
const MAX_RUN_MS = 7 * 60 * 1000;
const STEP_MAX_OUTPUT_TOKENS = 400;

export const warRoomAgent = new Agent(components.agent, {
  name: "war-room-facilitator",
  languageModel: anthropic("claude-sonnet-5"),
  instructions:
    "You are a live war-room facilitator working a task out loud for an audience of named participants watching in real time. " +
    "Work in short, focused bursts: a few sentences per turn, concrete progress each time, no throat-clearing. " +
    "When the prompt includes one or more lines starting with 'INTERJECTION from <name>:', you MUST explicitly acknowledge each named author by name and visibly adjust your course before continuing the work. " +
    `When the task is fully complete, end your final message with the literal marker ${RUN_COMPLETE_MARKER} on its own line.`,
});

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
    if (room.status === "running") {
      throw new Error("Room already running");
    }

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

    await ctx.runMutation(internal.roomsInternal.setRoomStatus, {
      roomId: args.roomId,
      status: "running",
    });

    try {
      const startedAt = Date.now();

      for (let step = 0; step < MAX_STEPS; step++) {
        if (Date.now() - startedAt > MAX_RUN_MS) {
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

        const prompt =
          step === 0
            ? room.taskPrompt
            : interjectionText
              ? `${interjectionText}\n\nContinue the work.`
              : "Continue the work.";

        const result = await warRoomAgent.streamText(
          ctx,
          { threadId },
          { prompt, maxOutputTokens: STEP_MAX_OUTPUT_TOKENS },
          { saveStreamDeltas: { chunking: "word", throttleMs: 200 } },
        );

        const text = await result.text;
        if (text.includes(RUN_COMPLETE_MARKER)) {
          break;
        }
      }

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
