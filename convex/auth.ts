import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { ResendOTPPasswordReset } from "./lib/passwordReset";
import { DEFAULT_NOTIF_PREFS } from "./lib/users";

const PasswordWithProfile = Password({
  reset: ResendOTPPasswordReset,
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    const name = String(params.name ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email address");
    }
    return { email, name: name || email.split("@")[0] };
  },
  validatePasswordRequirements(password: string) {
    if (password.length < 8) throw new ConvexError("Password must be at least 8 characters");
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordWithProfile, Google],
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
