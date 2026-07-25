import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getRoomStatus = internalQuery({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
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
