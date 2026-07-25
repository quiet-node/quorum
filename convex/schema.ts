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
    threadId: v.optional(v.string()),
    stopRequested: v.optional(v.boolean()),
    // Spend caps. Both optional so rooms created before the caps landed stay
    // valid against this schema.
    runCount: v.optional(v.number()),
    runStartedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

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

  repoFiles: defineTable({
    path: v.string(),
    content: v.string(),
  }).index("by_path", ["path"]),

  // Lead capture from room joins. Dashboard-only: no public query exposes
  // this table, and email must never be copied onto participants.
  leads: defineTable({
    email: v.string(),
    name: v.string(),
    roomId: v.id("rooms"),
  }).index("by_email", ["email"]),
});
