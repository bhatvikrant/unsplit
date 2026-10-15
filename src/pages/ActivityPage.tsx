import { useMutation, useQuery } from "convex/react";
import { Activity } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "@convex/_generated/api";
import { UserAvatar } from "@/components/common/Avatars";
import { EmptyState, PageHeader, RowSkeleton } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = NonNullable<ReturnType<typeof useQuery<typeof api.activity.feed>>>["items"][number];

function describe(it: Item): ReactNode {
  const who = it.isMe ? "You" : it.actor?.name ?? "Someone";
  const p = it.payload as Record<string, string | number | boolean | undefined>;
  const groupLink = it.group ? <Link to={`/groups/${it.group._id}`} className="font-medium hover:underline">{it.group.name}</Link> : null;
  const expenseLink = it.expense ? <Link to={`/expenses/${it.expense._id}`} className="font-medium hover:underline">"{it.expense.description}"</Link> : <span className="font-medium">"{String(p.description ?? "")}"</span>;
  const inGroup = it.group ? <> in {groupLink}</> : null;
  switch (it.type) {
    case "expense_added": return <>{who} added {expenseLink}{inGroup}.{p.recurring ? " (recurring)" : ""}</>;
    case "expense_updated": return <>{who} updated {expenseLink}{inGroup}.</>;
    case "expense_deleted": return <>{who} deleted {expenseLink}{inGroup}.</>;
    case "expense_restored": return <>{who} restored {expenseLink}{inGroup}.</>;
    case "payment_recorded": return <>{who} recorded a payment of <Money minor={Number(p.amountMinor)} currency={String(p.currency)} className="font-medium" /> from {String(p.payerName)} to {String(p.payeeName)}{inGroup}.</>;
    case "payment_deleted": return <>{who} deleted a payment of <Money minor={Number(p.amountMinor)} currency={String(p.currency)} className="font-medium" />{inGroup}.</>;
    case "comment_added": return <>{who} commented on {expenseLink}: <span className="text-text-muted italic">{String(p.content)}</span></>;
    case "group_created": return <>{who} created the group {groupLink}.</>;
    case "group_updated": return <>{who} updated the settings of {groupLink}.</>;
    case "group_deleted": return <>{who} deleted the group <span className="font-medium">{it.group?.name ?? String(p.name)}</span>.</>;
    case "group_restored": return <>{who} restored the group {groupLink}.</>;
    case "member_added": return p.joined ? <>{who} joined {groupLink}.</> : <>{who} added {it.subject?.name ?? String(p.memberName)} to {groupLink}.</>;
    case "member_removed": return <>{who} removed {it.subject?.name ?? String(p.memberName)} from {groupLink}.</>;
    case "member_left": return <>{who} left {groupLink}.</>;
    case "friend_added": return <>{who} added {it.subject?.name ?? "someone"} as a friend.</>;
    case "simplify_toggled": return <>{who} turned {p.on ? "on" : "off"} simplify debts in {groupLink}.</>;
    case "currency_converted": return <>{who} converted {Number(p.converted)} expense{Number(p.converted) === 1 ? "" : "s"}{inGroup} to {String(p.target)}.</>;
    case "reminder_sent": return <>{who} sent {it.subject?.name ?? "a friend"} a reminder.</>;
    default: return <>{who} did something.</>;
  }
}

export function ActivityPage() {
  const [cursors, setCursors] = useState<number[]>([]);
  const first = useQuery(api.activity.feed, { limit: 40 });
  const more = useQuery(api.activity.feed, cursors.length > 0 ? { limit: 40, before: cursors[cursors.length - 1] } : "skip");
  const markRead = useMutation(api.activity.markAllRead);
  useEffect(() => {
    if (first && first.items.some((i) => !i.read)) void markRead();
  }, [first, markRead]);

  const items = first ? [...first.items, ...(cursors.length > 0 && more ? more.items : [])] : undefined;
  const last = cursors.length > 0 ? more : first;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Recent activity" />
      {items === undefined ? (
        <RowSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="When you or your friends add expenses, settle up or change a group, it shows up here." />
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it._id} className={cn("flex gap-3 px-2 py-3", !it.read && "bg-brand-soft/40")}>
              {it.actor ? <UserAvatar user={it.actor} size="sm" /> : <div className="size-8" />}
              <div className="min-w-0 flex-1 text-sm">
                <div>{describe(it)}</div>
                {it.expense && it.expense.myNet !== null && it.expense.myNet !== 0 && (it.type === "expense_added" || it.type === "expense_updated") ? (
                  <div className={cn("text-xs", it.expense.myNet > 0 ? "text-positive" : "text-negative")}>
                    You {it.expense.myNet > 0 ? "get back" : "owe"} <Money minor={it.expense.myNet} currency={it.expense.currency} abs />
                  </div>
                ) : null}
                <div className="text-text-faint mt-0.5 text-xs">{relativeTime(it.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {last?.nextBefore ? (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={() => setCursors((c) => [...c, last.nextBefore as number])}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
