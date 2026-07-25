import { ConvexError } from "convex/values";
import { anthropic } from "@ai-sdk/anthropic";
import { createFireworks } from "@ai-sdk/fireworks";

/** Model used when AGENT_MODEL is not set on the deployment. */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5";

/** Prefix identifying a Fireworks-hosted model id, e.g. "accounts/fireworks/models/minimax-m2p7". */
const FIREWORKS_MODEL_PREFIX = "accounts/fireworks/";

/** True if the model id routes through @ai-sdk/fireworks rather than @ai-sdk/anthropic. */
export function isFireworksModelId(modelId: string): boolean {
  return modelId.startsWith(FIREWORKS_MODEL_PREFIX);
}

/**
 * Resolves the model id for a run.
 *
 * Read per call rather than captured in a module constant so changing the
 * AGENT_MODEL environment variable takes effect on the next run without a
 * redeploy.
 */
export function agentModelId(): string {
  return process.env.AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
}

/**
 * Resolves the AI SDK language model for a run from its model id.
 *
 * A Fireworks-hosted id (prefixed "accounts/fireworks/") routes through
 * @ai-sdk/fireworks; every other id keeps the existing Anthropic path. Throws
 * a ConvexError up front, before any run starts, if the provider key the
 * chosen model needs isn't set on this deployment, so a misconfig surfaces as
 * the room's error banner instead of a silent hang mid-run.
 *
 * @ai-sdk/fireworks is pinned to the "ai-v6" dist-tag release, which targets
 * the same @ai-sdk/provider version (3.0.14) as @ai-sdk/anthropic and
 * @convex-dev/agent in this repo, so no type cast is needed.
 */
export function languageModelForId(modelId: string): ReturnType<typeof anthropic> {
  if (modelId.startsWith(FIREWORKS_MODEL_PREFIX)) {
    if (!process.env.FIREWORKS_API_KEY) {
      throw new ConvexError("FIREWORKS_API_KEY is not set on this deployment");
    }
    return createFireworks({ apiKey: process.env.FIREWORKS_API_KEY })(modelId);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ConvexError("ANTHROPIC_API_KEY is not set on this deployment");
  }
  return anthropic(modelId);
}
