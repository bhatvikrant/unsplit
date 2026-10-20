import { useQuery } from "@/lib/convex";
import { ArrowRight, HandCoins, Plus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "@convex/_generated/api";
import { UserAvatar } from "@/components/common/Avatars";
import { ExpenseRow, useDeleteExpense } from "@/components/common/ExpenseList";
import { useSwipedRow } from "@/components/common/SwipeToDelete";
import { EmptyState, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { usePagedExpenses } from "@/lib/usePagedExpenses";
import { cn } from "@/lib/utils";

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Dashboard() {
  const me = useMe();
  const friends = useQuery(api.friends.list);
  const groups = useQuery(api.groups.list);
  const recent = usePagedExpenses({}, 5);
  const dialogs = useDialogs();

  const totals: Record<string, { owe: number; owed: number }> = {};
  for (const f of friends ?? []) {
    for (const [cur, v] of Object.entries(f.balances)) {
      const t = (totals[cur] ??= { owe: 0, owed: 0 });
      if (v > 0) t.owed += v;
      else t.owe += -v;
    }
  }
  const currencies = Object.keys(totals);
  const nets = currencies.map((c) => ({ currency: c, net: totals[c].owed - totals[c].owe })).filter((x) => x.net !== 0);
  const owe = (friends ?? []).filter((f) => Object.values(f.balances).some((v) => v < 0));
  const owed = (friends ?? []).filter((f) => Object.values(f.balances).some((v) => v > 0));
  const settled = (friends ?? []).filter((f) => Object.values(f.balances).every((v) => v === 0));
  const nothingYet = friends?.length === 0 && groups?.length === 0;
  const [now] = useState(() => new Date());
  const recentItems = recent.items?.slice(0, 5);
  const swipe = useSwipedRow();
  const del = useDeleteExpense();

  return (
    <div>
      <PageHeader
        title={me ? `${greeting(now)}, ${me.name.split(" ")[0]}` : "Dashboard"}
        subtitle={formatDate(now.getTime(), "weekday")}
      />

      {friends === undefined ? (
        <RowSkeleton />
      ) : nothingYet ? (
        <EmptyState
          icon={Users}
          title="Nothing to split yet"
          description="Start a group for a trip or a flat, or add a friend to share one-off costs with."
          action={
            <div className="flex gap-2">
              <Button onClick={() => dialogs.createGroup()}>
                <Users /> Start a group
              </Button>
              <Button variant="outline" onClick={() => dialogs.addFriend()}>
                <UserPlus /> Add a friend
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <section className="hero-gradient shadow-hero relative mb-4 overflow-hidden rounded-[18px] px-6 py-5 text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_200px_at_85%_-20%,rgba(255,255,255,0.22),transparent_60%)]" />
            <div className="relative grid gap-5 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-end lg:grid-cols-[1.4fr_1fr_1fr_auto]">
              <div>
                <div className="text-[12.5px] font-medium text-white/80">
                  {nets.length === 0 ? "Overall" : nets.every((n) => n.net < 0) ? "Overall, you owe" : nets.every((n) => n.net > 0) ? "Overall, you're owed" : "Overall"}
                </div>
                {nets.length === 0 ? (
                  <div className="mt-1 text-[32px] leading-none font-semibold tracking-[-0.03em]">All settled up</div>
                ) : (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {nets.map((n) => (
                      <Money
                        key={n.currency}
                        minor={n.net}
                        currency={n.currency}
                        abs
                        signDisplay={nets.every((x) => x.net < 0) || nets.every((x) => x.net > 0) ? "never" : "always"}
                        className={cn("block leading-none font-semibold tracking-[-0.03em]", nets.length === 1 ? "text-[40px]" : "text-[26px]")}
                      />
                    ))}
                  </div>
                )}
              </div>
              <HeroStat label="You owe" tone="owe">
                {currencies.filter((c) => totals[c].owe > 0).length === 0 ? <span className="text-white/70">nothing</span> : currencies.filter((c) => totals[c].owe > 0).map((c) => <Money key={c} minor={totals[c].owe} currency={c} className="block" />)}
              </HeroStat>
              <HeroStat label="You're owed" tone="owed">
                {currencies.filter((c) => totals[c].owed > 0).length === 0 ? <span className="text-white/70">nothing</span> : currencies.filter((c) => totals[c].owed > 0).map((c) => <Money key={c} minor={totals[c].owed} currency={c} className="block" />)}
              </HeroStat>
              <div className="flex gap-2 sm:col-span-3 lg:col-span-1 lg:self-center">
                <Button onClick={() => dialogs.settleUp()} className="bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)] backdrop-blur-sm hover:bg-white/25">
                  <HandCoins /> Settle up
                </Button>
                <Button onClick={() => dialogs.addExpense()} className="bg-white text-brand-ink shadow-[0_1px_2px_rgba(0,0,0,0.15)] hover:bg-white/90 dark:text-[#14543b]">
                  <Plus /> Add expense
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="You owe" actions={<span className="text-text-faint text-xs">{owe.length === 0 ? "" : `${owe.length} ${owe.length === 1 ? "person" : "people"}`}</span>}>
              {owe.length === 0 ? <p className="text-text-faint px-4 py-7 text-center text-sm">You don't owe anyone.</p> : (
                <ul className="p-1">
                  {owe.map((f) => (
                    <FriendLine key={f.user._id} user={f.user} balances={Object.fromEntries(Object.entries(f.balances).filter(([, v]) => v < 0))} action="Settle up" onAction={() => dialogs.settleUp({ payerId: me?._id, payeeId: f.user._id })} />
                  ))}
                </ul>
              )}
            </Section>
            <Section title="You're owed" actions={<span className="text-text-faint text-xs">{owed.length === 0 ? "" : `${owed.length} ${owed.length === 1 ? "person" : "people"}`}</span>}>
              {owed.length === 0 ? <p className="text-text-faint px-4 py-7 text-center text-sm">Nobody owes you.</p> : (
                <ul className="p-1">
                  {owed.map((f) => (
                    <FriendLine key={f.user._id} user={f.user} balances={Object.fromEntries(Object.entries(f.balances).filter(([, v]) => v > 0))} action="Settle up" onAction={() => dialogs.settleUp({ payerId: f.user._id, payeeId: me?._id })} />
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {recentItems && recentItems.length > 0 ? (
            <Section
              className="mt-4"
              title="Recent"
              actions={
                <Link to="/expenses" className="text-text-faint hover:text-text inline-flex items-center gap-1 text-xs font-medium">
                  All expenses <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              <ul className="p-1">
                {recentItems.map((it) => (
                  <ExpenseRow key={it._id} item={it} showGroup swipe={swipe.row(it._id)} onDelete={() => del(it).finally(swipe.close)} />
                ))}
              </ul>
            </Section>
          ) : null}

          {settled.length > 0 ? (
            <p className="text-text-faint mt-4 text-xs">
              Settled up with {settled.map((f) => f.user.name).slice(0, 6).join(", ")}
              {settled.length > 6 ? ` and ${settled.length - 6} more` : ""}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function HeroStat({ label, tone, children }: { label: string; tone: "owe" | "owed"; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] font-medium text-white/75">{label}</div>
      <div className={cn("mt-0.5 text-xl font-semibold tracking-[-0.02em]", tone === "owe" ? "text-[#ffd9ce]" : "text-[#d9f7e6]")}>{children}</div>
    </div>
  );
}

function FriendLine({ user, balances, action, onAction }: { user: { _id: string; name: string; image?: string }; balances: Record<string, number>; action: string; onAction: () => void }) {
  return (
    <li className="group hover:bg-surface-2 flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors duration-100">
      <Link to={`/friends/${user._id}`} className="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:underline">
        <UserAvatar user={user} size="sm" />
        <span className="truncate text-sm font-medium">{user.name}</span>
      </Link>
      <div className="flex flex-col items-end">
        {Object.entries(balances).map(([c, v]) => (
          <Money key={c} minor={v} currency={c} abs tone={v > 0 ? "positive" : "negative"} className="text-sm font-semibold tracking-[-0.01em]" />
        ))}
      </div>
      <Button variant="outline" size="xs" className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" onClick={onAction}>
        {action}
      </Button>
    </li>
  );
}
