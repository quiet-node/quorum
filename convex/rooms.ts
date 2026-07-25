import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const COLOR_PALETTE = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#4ade80", // green
  "#22d3ee", // cyan
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
];

const ACTIVE_WINDOW_MS = 25_000;

export const createRoom = mutation({
  args: {
    title: v.string(),
    taskPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const roomId = await ctx.db.insert("rooms", {
      title: args.title,
      taskPrompt: args.taskPrompt,
      status: "idle",
    });
    return roomId;
  },
});

export const joinRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const color = COLOR_PALETTE[existing.length % COLOR_PALETTE.length];
    const participantId = await ctx.db.insert("participants", {
      roomId: args.roomId,
      name: args.name,
      color,
      lastSeenAt: Date.now(),
    });
    return { participantId, color };
  },
});

export const heartbeat = mutation({
  args: {
    participantId: v.id("participants"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.participantId, { lastSeenAt: Date.now() });
  },
});

export const resetRoom = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, { status: "idle" });
    const interjections = await ctx.db
      .query("interjections")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const interjection of interjections) {
      await ctx.db.patch(interjection._id, { consumed: true });
    }
  },
});

export const getRoom = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
  },
});

export const listParticipants = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    return participants.filter((p) => p.lastSeenAt >= cutoff);
  },
});
