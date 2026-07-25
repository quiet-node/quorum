import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

export const seedBatch = internalMutation({
  args: {
    files: v.array(v.object({ path: v.string(), content: v.string() })),
  },
  handler: async (ctx, args) => {
    for (const file of args.files) {
      const existing = await ctx.db
        .query("repoFiles")
        .withIndex("by_path", (q) => q.eq("path", file.path))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { content: file.content });
      } else {
        await ctx.db.insert("repoFiles", file);
      }
    }
  },
});

export const listRepoFiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db.query("repoFiles").collect();
    return files.map((f) => ({ path: f.path, bytes: f.content.length }));
  },
});

export const listRepoFilePaths = query({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db.query("repoFiles").collect();
    return files
      .map((f) => ({ path: f.path, bytes: f.content.length }))
      .sort((a, b) => a.path.localeCompare(b.path));
  },
});

export const getRepoFileContent = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("repoFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();
    return file ? file.content : null;
  },
});

export const getRepoFile = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("repoFiles")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();
    return file ? file.content : null;
  },
});
