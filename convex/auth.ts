import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { env, type MutationCtx } from "./_generated/server";
import { DEFAULT_NOTIF_PREFS } from "./lib/users";

/**
 * Email + password sign-in for the Playwright suite (tests/e2e), which has no Google account to
 * use. Present only when E2E_AUTH=1 is set on the deployment, and only on a local deployment
 * (`npx convex dev` on 127.0.0.1), so it can never be switched on in the cloud. See README, "Test".
 */
const e2ePassword = Password<DataModel>({
  profile: (params) => ({
    email: String(params.email ?? "").trim().toLowerCase(),
    name: typeof params.name === "string" && params.name.trim() ? params.name.trim() : undefined,
  }),
});
const e2eAuth = env.E2E_AUTH === "1" && env.CONVEX_CLOUD_URL.startsWith("http://127.0.0.1:");

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: e2eAuth ? [Google, e2ePassword] : [Google],
  callbacks: {
    /**
     * Claim a placeholder user (a friend added by name + email before they
     * signed up) instead of creating a duplicate account.
     */
    async createOrUpdateUser(rawCtx, args) {
      const ctx = rawCtx as unknown as MutationCtx;
      if (args.existingUserId) {
        const existing = await ctx.db.get(args.existingUserId);
        if (existing && args.profile.image && !existing.image) {
          await ctx.db.patch(args.existingUserId, { image: args.profile.image as string });
        }
        return args.existingUserId;
      }
      const email = typeof args.profile.email === "string" ? args.profile.email.toLowerCase() : undefined;
      const name = typeof args.profile.name === "string" ? args.profile.name : undefined;
      const image = typeof args.profile.image === "string" ? args.profile.image : undefined;
      if (email) {
        const existing = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, {
            isPlaceholder: false,
            name: existing.isPlaceholder ? (name ?? existing.name) : existing.name,
            image: existing.image ?? image,
            emailVerificationTime: args.profile.emailVerified ? Date.now() : existing.emailVerificationTime,
          });
          return existing._id;
        }
      }
      return await ctx.db.insert("users", {
        email,
        name: name ?? (email ? email.split("@")[0] : "New user"),
        image,
        isPlaceholder: false,
        defaultCurrency: "USD",
        notifPrefs: DEFAULT_NOTIF_PREFS,
        emailVerificationTime: args.profile.emailVerified ? Date.now() : undefined,
      });
    },
  },
});
