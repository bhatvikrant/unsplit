import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

const KEEP_MS = 14 * 24 * 3600_000;

/** Cron: idempotency keys only matter for a few hours after the client sent them. */
export const pruneIdempotencyKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - KEEP_MS;
    const old = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});

/**
 * The images the app stores, for scripts/shrink-images.mjs: every receipt, avatar and group cover
 * with its size, type and a URL to fetch it. Internal: only the CLI and the dashboard can call it.
 */
export const listImages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { kind: "receipt" | "avatar" | "cover"; docId: string; storageId: Id<"_storage">; size: number; contentType: string | null; url: string | null }[] = [];
    const add = async (kind: "receipt" | "avatar" | "cover", docId: string, storageId: Id<"_storage">) => {
      const meta = await ctx.db.system.get("_storage", storageId);
      if (!meta) return;
      out.push({ kind, docId, storageId, size: meta.size, contentType: meta.contentType ?? null, url: await ctx.storage.getUrl(storageId) });
    };
    for (const e of await ctx.db.query("expenses").collect()) if (e.receiptId) await add("receipt", e._id, e.receiptId);
    for (const u of await ctx.db.query("users").collect()) if (u.avatarId) await add("avatar", u._id, u.avatarId);
    for (const g of await ctx.db.query("groups").collect()) if (g.coverId) await add("cover", g._id, g.coverId);
    return out;
  },
});

/** An upload URL for the shrink script, which has no user session. */
export const imageUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/**
 * Points a document at a re-encoded copy of its image and deletes the original, but only if the
 * document still names the original (someone may have replaced it in the meantime).
 */
export const swapImage = internalMutation({
  args: {
    kind: v.union(v.literal("receipt"), v.literal("avatar"), v.literal("cover")),
    docId: v.string(),
    from: v.id("_storage"),
    to: v.id("_storage"),
  },
  handler: async (ctx, { kind, docId, from, to }) => {
    const field = kind === "receipt" ? "receiptId" : kind === "avatar" ? "avatarId" : "coverId";
    const table = kind === "receipt" ? "expenses" : kind === "avatar" ? "users" : "groups";
    const id = ctx.db.normalizeId(table, docId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || (doc as Record<string, unknown>)[field] !== from) {
      await ctx.storage.delete(to);
      return false;
    }
    await ctx.db.patch(id!, { [field]: to } as never);
    await ctx.storage.delete(from);
    return true;
  },
});
