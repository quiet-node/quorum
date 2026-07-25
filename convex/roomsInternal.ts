import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/** Most rooms allowed to hold a live run at the same time, across the app. */
const MAX_CONCURRENT_RUNS = 2;
/** Most runs a single room may ever start. */
const MAX_RUNS_PER_ROOM = 10;
/**
 * How long a reserved run may occupy a concurrency slot. Slightly longer than
 * the agent's own run budget so a run that dies without ever writing a terminal
 * status (deploy restart, action timeout) releases its slot instead of blocking
 * every future run forever.
 */
const RUN_SLOT_TTL_MS = 8 * 60 * 1000;

export const getRoomStatus = internalQuery({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
  },
});

/**
 * Claims a run slot for a room and marks it running, or rejects.
 *
 * Everything that guards spend happens here in one mutation so it is
 * transactional: two startRun calls racing each other cannot both read a
 * running count below the cap and then both flip their room to "running".
 * The run counter is incremented in the same write for the same reason.
 *
 * Rejections are ConvexError so the message survives to the client in
 * production instead of being scrubbed to a generic server error.
 */
export const reserveRun = internalMutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room === null) {
      throw new ConvexError("Room not found.");
    }
    if (room.status === "running") {
      throw new ConvexError("This room is already running.");
    }

    const runCount = room.runCount ?? 0;
    if (runCount >= MAX_RUNS_PER_ROOM) {
      throw new ConvexError(
        `This room has hit its limit of ${MAX_RUNS_PER_ROOM} runs. Open a new room.`,
      );
    }

    // Count only rooms whose slot is still fresh, so an abandoned "running"
    // room cannot permanently consume global capacity.
    const now = Date.now();
    const running = await ctx.db
      .query("rooms")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    const liveRuns = running.filter(
      (r) => now - (r.runStartedAt ?? 0) < RUN_SLOT_TTL_MS,
    );
    if (liveRuns.length >= MAX_CONCURRENT_RUNS) {
      throw new ConvexError(
        `${MAX_CONCURRENT_RUNS} rooms are already running. Wait for one to finish, then start again.`,
      );
    }

    await ctx.db.patch(args.roomId, {
      status: "running",
      stopRequested: false,
      runCount: runCount + 1,
      runStartedAt: now,
    });
  },
});

export const setRoomStatus = internalMutation({
  args: {
    roomId: v.id("rooms"),
    status: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("error"),
      v.literal("done"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, { status: args.status });
  },
});

export const clearStopRequested = internalMutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, { stopRequested: false });
  },
});

export const setThreadId = internalMutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, { threadId: args.threadId });
  },
});

export const getUnconsumedInterjections = internalQuery({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interjections")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("consumed"), false))
      .collect();
  },
});

export const markInterjectionsConsumed = internalMutation({
  args: {
    ids: v.array(v.id("interjections")),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.patch(id, { consumed: true });
    }
  },
});
