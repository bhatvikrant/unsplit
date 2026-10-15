import { useQuery } from "convex/react";
import { HandCoins, Plus, UserPlus, Users } from "lucide-react";
import { Link } from "react-router";
import { api } from "@convex/_generated/api";
import { UserAvatar } from "@/components/common/Avatars";
import { EmptyState, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks";

export function Dashboard() {
  const me = useMe();
  const friends = useQuery(api.friends.list);
  const groups = useQuery(api.groups.list);
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
  const owe = (friends ?? []).filter((f) => Object.values(f.balances).some((v) => v < 0));
  const owed = (friends ?? []).filter((f) => Object.values(f.balances).some((v) => v > 0));
  const settled = (friends ?? []).filter((f) => Object.values(f.balances).every((v) => v === 0));
  const nothingYet = friends?.length === 0 && groups?.length === 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={me ? `Hi ${me.name.split(" ")[0]}` : undefined}
        actions={
          <>
            <Button onClick={() => dialogs.addExpense()}>
              <Plus /> Add expense
            </Button>
            <Button variant="secondary" onClick={() => dialogs.settleUp()}>
              <HandCoins /> Settle up
            </Button>
          </>
        }
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
          <div className="mb-5 grid grid-cols-3 divide-x rounded-lg border">
            <Stat label="Total balance">
              {currencies.length === 0 ? <span className="text-text-faint">settled up</span> : currencies.map((c) => <Money key={c} minor={totals[c].owed - totals[c].owe} currency={c} tone="auto" signDisplay="exceptZero" className="block" />)}
            </Stat>
            <Stat label="You owe">
              {currencies.filter((c) => totals[c].owe > 0).length === 0 ? <span className="text-text-faint">nothing</span> : currencies.filter((c) => totals[c].owe > 0).map((c) => <Money key={c} minor={totals[c].owe} currency={c} tone="negative" className="block" />)}
            </Stat>
            <Stat label="You are owed">
              {currencies.filter((c) => totals[c].owed > 0).length === 0 ? <span className="text-text-faint">nothing</span> : currencies.filter((c) => totals[c].owed > 0).map((c) => <Money key={c} minor={totals[c].owed} currency={c} tone="positive" className="block" />)}
            </Stat>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="You owe">
              {owe.length === 0 ? <p className="text-text-faint px-4 py-6 text-center text-sm">You don't owe anyone.</p> : (
                <ul className="divide-y">
                  {owe.map((f) => (
                    <FriendLine key={f.user._id} user={f.user} balances={Object.fromEntries(Object.entries(f.balances).filter(([, v]) => v < 0))} onSettle={() => dialogs.settleUp({ payerId: me?._id, payeeId: f.user._id })} />
                  ))}
                </ul>
              )}
            </Section>
            <Section title="You are owed">
              {owed.length === 0 ? <p className="text-text-faint px-4 py-6 text-center text-sm">Nobody owes you.</p> : (
                <ul className="divide-y">
                  {owed.map((f) => (
                    <FriendLine key={f.user._id} user={f.user} balances={Object.fromEntries(Object.entries(f.balances).filter(([, v]) => v > 0))} onSettle={() => dialogs.settleUp({ payerId: f.user._id, payeeId: me?._id })} />
                  ))}
                </ul>
              )}
            </Section>
          </div>
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

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="text-text-muted text-xs font-medium">{label}</div>
      <div className="mt-1 text-base font-semibold sm:text-lg">{children}</div>
    </div>
  );
}

function FriendLine({ user, balances, onSettle }: { user: { _id: string; name: string; image?: string }; balances: Record<string, number>; onSettle: () => void }) {
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5">
      <Link to={`/friends/${user._id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar user={user} size="sm" />
        <span className="truncate text-sm font-medium">{user.name}</span>
      </Link>
      <div className="flex flex-col items-end text-sm">
        {Object.entries(balances).map(([c, v]) => (
          <Money key={c} minor={v} currency={c} abs tone={v > 0 ? "positive" : "negative"} className="font-medium" />
        ))}
      </div>
      <Button variant="ghost" size="sm" className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" onClick={onSettle}>
        Settle up
      </Button>
    </li>
  );
}
