/**
 * Extracts the human-readable message from a rejected Convex call.
 *
 * Convex only forwards the payload of a ConvexError to the client in
 * production; anything else is scrubbed to a generic server error. Reading the
 * `data` field by shape rather than by `instanceof` keeps this working across
 * the client and server copies of the error class.
 */
export function convexErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: unknown } | null)?.data;
  return typeof data === "string" && data.length > 0 ? data : fallback;
}
