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

/**
 * Deletes any repoFiles row whose path is not in keepPaths.
 *
 * seedBatch only upserts, so a file dropped from the tracked set (e.g.
 * AGENTS.md, CLAUDE.md) would otherwise linger in the snapshot forever.
 * Called once per seed run with the full current path list.
 */
export const pruneRepoFiles = internalMutation({
  args: { keepPaths: v.array(v.string()) },
  handler: async (ctx, args) => {
    const keep = new Set(args.keepPaths);
    const files = await ctx.db.query("repoFiles").collect();
    for (const file of files) {
      if (!keep.has(file.path)) {
        await ctx.db.delete(file._id);
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
