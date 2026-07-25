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
