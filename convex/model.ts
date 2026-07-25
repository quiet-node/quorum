/** Model used when AGENT_MODEL is not set on the deployment. */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5";

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
