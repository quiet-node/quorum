"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    await ctx.runMutation(internal.roomsInternal.setRoomStatus, {
      roomId: args.roomId,
      status: "running",
    });
    // Streaming agent loop lands in a later job.
  },
});
