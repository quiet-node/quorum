import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    title: v.string(),
    taskPrompt: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("error"),
      v.literal("done"),
    ),
  }),

  participants: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    color: v.string(),
    lastSeenAt: v.number(),
  }).index("by_room", ["roomId"]),

  interjections: defineTable({
    roomId: v.id("rooms"),
    authorName: v.string(),
    text: v.string(),
    consumed: v.boolean(),
  }).index("by_room", ["roomId"]),
});
