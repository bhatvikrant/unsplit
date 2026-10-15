import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_NOTIF_PREFS = {
  expenseAdded: true,
  expenseUpdated: true,
  commentAdded: true,
  addedToGroup: true,
  friendAdded: true,
  paymentRecorded: true,
  reminders: true,
  monthlySummary: false,
};

export type PublicUser = {
  _id: Id<"users">;
  name: string;
  email?: string;
  image?: string;
  isPlaceholder: boolean;
};

export async function publicUser(ctx: QueryCtx | MutationCtx, user: Doc<"users"> | null | undefined, selfId?: Id<"users">): Promise<PublicUser | null> {
  if (!user) return null;
  let image = user.image;
  if (user.avatarId) image = (await ctx.storage.getUrl(user.avatarId)) ?? image;
  return {
    _id: user._id,
    name: user.deletedAt ? "Deleted user" : (user.name ?? user.email ?? "Someone"),
    email: user._id === selfId || !user.deletedAt ? user.email : undefined,
    image: user.deletedAt ? undefined : image,
    isPlaceholder: Boolean(user.isPlaceholder),
  };
}

export async function publicUsers(ctx: QueryCtx | MutationCtx, ids: Id<"users">[], selfId?: Id<"users">): Promise<PublicUser[]> {
  const out: PublicUser[] = [];
  for (const id of [...new Set(ids)]) {
    const u = await publicUser(ctx, await ctx.db.get(id), selfId);
    if (u) out.push(u);
  }
  return out;
}

export function normalizeEmail(email: string | undefined): string | undefined {
  const e = email?.trim().toLowerCase();
  return e ? e : undefined;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Find by email, or create a placeholder user that a real sign-up later claims. */
export async function findOrCreateUser(
  ctx: MutationCtx,
  args: { name?: string; email?: string; invitedBy: Id<"users"> },
): Promise<Id<"users">> {
  const email = normalizeEmail(args.email);
  const name = args.name?.trim();
  if (email) {
    const existing = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
    if (existing) return existing._id;
  }
  if (!name && !email) throw new Error("A name or an email is required");
  return await ctx.db.insert("users", {
    name: name || email!.split("@")[0],
    email,
    isPlaceholder: true,
    invitedBy: args.invitedBy,
    defaultCurrency: "USD",
    notifPrefs: DEFAULT_NOTIF_PREFS,
  });
}
