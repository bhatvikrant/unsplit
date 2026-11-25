import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/access";
import { enforceLimit } from "./lib/rateLimit";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    await enforceLimit(ctx, "upload", me, "Upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const url = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireUserId(ctx);
    return await ctx.storage.getUrl(storageId);
  },
});
