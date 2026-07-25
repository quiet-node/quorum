import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { components } from "./_generated/api";
import { listUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { agentModelId } from "./model";

// Muted, near-neutral identity colors: readable on near-black without
// competing with the single emerald accent.
const COLOR_PALETTE = [
  "#9fb2ab",
  "#a8a8b0",
  "#b0a493",
  "#94a3b2",
  "#a9b09a",
  "#b19aa8",
  "#9aa7b0",
  "#b0ab9a",
];

const ACTIVE_WINDOW_MS = 25_000;

const RECENT_ROOM_LIMIT = 12;

/** Reports the model runs will use, so the UI can label it honestly. */
export const getAgentModel = query({
  args: {},
  handler: async () => agentModelId(),
});

/**
 * Creates a room.
 *
 * Creating, joining, watching, and steering are all authless by design: spend
 * is bounded by the server-side run caps in reserveRun, not by a gate here.
 */
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
      runCount: 0,
    });
    return roomId;
  },
});

/**
 * Lists the most recent rooms for the landing page rail.
 *
 * Returns only presentation fields. The task prompt and any internal run
 * bookkeeping are deliberately excluded so nothing sensitive reaches an
 * unauthenticated client.
 */
export const listRecentRooms = query({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query("rooms").order("desc").take(RECENT_ROOM_LIMIT);
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    return await Promise.all(
      rooms.map(async (room) => {
        const participants = await ctx.db
          .query("participants")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        return {
          _id: room._id,
          title: room.title,
          status: room.status,
          createdAt: room._creationTime,
          people: participants.filter((p) => p.lastSeenAt >= cutoff).length,
        };
      }),
    );
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
    await ctx.db.patch(args.roomId, { status: "idle", stopRequested: false });
    const interjections = await ctx.db
      .query("interjections")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const interjection of interjections) {
      await ctx.db.patch(interjection._id, { consumed: true });
    }
  },
});

export const requestStop = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roomId, { stopRequested: true });
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

export const addInterjection = mutation({
  args: {
    roomId: v.id("rooms"),
    authorName: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("interjections", {
      roomId: args.roomId,
      authorName: args.authorName,
      text: args.text,
      consumed: false,
    });
  },
});

export const listInterjections = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interjections")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});
