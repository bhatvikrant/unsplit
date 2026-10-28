import { useMutation, useQuery } from "@/lib/convex";
import {
  Activity, Banknote, Bell, CalendarDays, ChevronDown, ChevronRight, MessageCircle, Pencil, Plus, Receipt, Trash2, UserPlus, UserRound, Users, X,
  type LucideIcon,
} from "lucide-react";
import { endOfDay, endOfMonth, format, isThisYear, isToday, isYesterday, startOfDay, startOfMonth, startOfToday, startOfWeek, subMonths } from "date-fns";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { GroupAvatar, UserAvatar } from "@/components/common/Avatars";
import { EmptyState, PageHeader, RowSkeleton } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useLastDefined, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Feed = NonNullable<ReturnType<typeof useQuery<typeof api.activity.feed>>>;
type Item = Feed["items"][number];
type Kind = "expenses" | "payments" | "groups" | "people";
type Period = "any" | "today" | "week" | "month" | "lastMonth" | "custom";

const KINDS: { value: Kind | "all"; label: string; noun: [string, string] }[] = [
  { value: "all", label: "All", noun: ["activity", "activities"] },
  { value: "expenses", label: "Expenses", noun: ["expense change", "expense changes"] },
  { value: "payments", label: "Payments", noun: ["payment", "payments"] },
  { value: "groups", label: "Groups", noun: ["group change", "group changes"] },
  { value: "people", label: "People", noun: ["people change", "people changes"] },
];
const PERIODS: { value: Exclude<Period, "custom">; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];

/** The [after, before) window a period covers; `undefined` bounds are open. */
function periodRange(period: Period, custom: { from: number; to: number }): { after?: number; before?: number } {
  const now = new Date();
  switch (period) {
    case "today": return { after: startOfToday().getTime() };
    case "week": return { after: startOfWeek(now, { weekStartsOn: 1 }).getTime() };
    case "month": return { after: startOfMonth(now).getTime() };
    case "lastMonth": { const m = subMonths(now, 1); return { after: startOfMonth(m).getTime(), before: endOfMonth(m).getTime() + 1 }; }
    case "custom": return { after: startOfDay(custom.from).getTime(), before: endOfDay(custom.to).getTime() + 1 };
    default: return {};
  }
}

function periodLabel(period: Period, custom: { from: number; to: number }): string {
  if (period === "custom") {
    const f = new Date(custom.from), t = new Date(custom.to);
    const fmt = (d: Date) => format(d, isThisYear(d) ? "d MMM" : "d MMM yy");
    return f.getTime() === t.getTime() ? fmt(f) : `${fmt(f)} – ${fmt(t)}`;
  }
  return PERIODS.find((p) => p.value === period)?.label ?? "Any time";
}

// ---------- row semantics ----------

/** The small badge on the actor's avatar: coloured by what happened, not by what it happened to. */
const BADGE: Record<Item["type"], { icon: LucideIcon; tone: "add" | "edit" | "del" | "pay" | "grp" | "cmt" | "warn" }> = {
  expense_added: { icon: Plus, tone: "add" },
  expense_restored: { icon: Plus, tone: "add" },
  group_restored: { icon: Plus, tone: "add" },
  expense_updated: { icon: Pencil, tone: "edit" },
  group_updated: { icon: Pencil, tone: "edit" },
  simplify_toggled: { icon: Pencil, tone: "edit" },
  currency_converted: { icon: Pencil, tone: "edit" },
  expense_deleted: { icon: Trash2, tone: "del" },
  payment_deleted: { icon: Trash2, tone: "del" },
  group_deleted: { icon: Trash2, tone: "del" },
  member_removed: { icon: Trash2, tone: "del" },
  member_left: { icon: Trash2, tone: "del" },
  payment_recorded: { icon: Banknote, tone: "pay" },
  comment_added: { icon: MessageCircle, tone: "cmt" },
  group_created: { icon: Users, tone: "grp" },
  member_added: { icon: UserPlus, tone: "grp" },
  friend_added: { icon: UserPlus, tone: "grp" },
  reminder_sent: { icon: Bell, tone: "warn" },
};
const BADGE_TONE = {
  add: "bg-positive-soft text-positive",
  edit: "bg-warning-soft text-warning",
  del: "bg-negative-soft text-negative",
  pay: "bg-brand text-on-brand",
  grp: "bg-brand-soft text-brand-ink",
  cmt: "bg-surface-3 text-text-muted",
  warn: "bg-warning-soft text-warning",
};

function TypeBadge({ type }: { type: Item["type"] }) {
  const { icon: Icon, tone } = BADGE[type] ?? { icon: Activity, tone: "cmt" as const };
  return (
    <span className={cn("ring-surface absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full ring-2", BADGE_TONE[tone])} aria-hidden>
      <Icon className="size-2.5" strokeWidth={2.75} />
    </span>
  );
}

function amountOf(it: Item): number | null {
  const p = it.payload as { amountMinor?: number };
  return it.expense?.amountMinor ?? (typeof p.amountMinor === "number" ? p.amountMinor : null);
}
function currencyOf(it: Item): string | null {
  const p = it.payload as { currency?: string };
  return it.expense?.currency ?? (typeof p.currency === "string" ? p.currency : null);
}

/**
 * How this item changed what the viewer is owed, for day and cluster totals: the same sign as the
 * "you get back" / "you owe" shown on the row. Payments settle rather than create debt, so they're
 * left out (otherwise being paid back would read as a red number). Edits are skipped too: their
 * delta isn't recorded.
 */
function balanceEffect(it: Item): number {
  const net = it.expense?.myNet;
  if (net === null || net === undefined) return 0;
  switch (it.type) {
    case "expense_added": case "expense_restored": return net;
    case "expense_deleted": return -net;
    default: return 0;
  }
}

/** Sum of balance effects when every item shares one currency; `null` when currencies mix or nothing moved. */
function netOf(items: Item[]): { minor: number; currency: string } | null {
  let minor = 0; let currency: string | null = null;
  for (const it of items) {
    const eff = balanceEffect(it);
    if (eff === 0) continue;
    const c = currencyOf(it);
    if (!c) continue;
    if (currency && currency !== c) return null;
    currency = c; minor += eff;
  }
  return currency && minor !== 0 ? { minor, currency } : null;
}

function describe(it: Item, meId: Id<"users"> | undefined): ReactNode {
  const who = it.isMe ? "You" : it.actor?.name ?? "Someone";
  const p = it.payload as Record<string, string | number | boolean | undefined>;
  const groupName = <span className="font-medium">{it.group?.name ?? String(p.name ?? "")}</span>;
  const expenseLink = it.expense ? <Link to={`/expenses/${it.expense._id}`} className="font-medium hover:underline">{it.expense.description}</Link> : <span className="font-medium">{String(p.description ?? "")}</span>;
  const money = <Money minor={Number(p.amountMinor)} currency={String(p.currency)} className="font-medium" />;
  switch (it.type) {
    case "expense_added": return <>{who} added {expenseLink}{p.recurring ? " (recurring)" : ""}</>;
    case "expense_updated": return <>{who} updated {expenseLink}</>;
    case "expense_deleted": return <>{who} deleted {expenseLink}</>;
    case "expense_restored": return <>{who} restored {expenseLink}</>;
    case "payment_recorded": {
      // The feed is about what happened, so lead with the payer; who typed it in is a detail.
      const payerMe = p.payerId === meId, payeeMe = p.payeeId === meId;
      if (!p.payerId) return <>{who} recorded a payment of {money} from {String(p.payerName ?? "someone")} to {String(p.payeeName ?? "someone")}</>;
      const payer = payerMe ? "You" : String(p.payerName ?? "Someone"), payee = payeeMe ? "you" : String(p.payeeName ?? "someone");
      const recordedBy = it.isMe || it.actor?._id === p.payerId ? null : <span className="text-text-faint"> · recorded by {who}</span>;
      return <>{payer} paid {payee} {money}{recordedBy}</>;
    }
    case "payment_deleted": return <>{who} deleted a payment of {money}</>;
    case "comment_added": return <>{who} commented on {expenseLink}</>;
    case "group_created": return <>{who} created the group</>;
    case "group_updated": return <>{who} updated the group settings</>;
    case "group_deleted": return <>{who} deleted the group {groupName}</>;
    case "group_restored": return <>{who} restored the group</>;
    case "member_added": return p.joined ? <>{who} joined</> : <>{who} added {it.subject?.name ?? String(p.memberName)}</>;
    case "member_removed": return <>{who} removed {it.subject?.name ?? String(p.memberName)}</>;
    case "member_left": return <>{who} left</>;
    case "friend_added": return <>{who} added {it.subject?.name ?? "someone"} as a friend</>;
    case "simplify_toggled": return <>{who} turned {p.on ? "on" : "off"} simplify debts</>;
    case "currency_converted": return <>{who} converted {Number(p.converted)} expense{Number(p.converted) === 1 ? "" : "s"} to {String(p.target)}</>;
    case "reminder_sent": return <>{who} sent {it.subject?.name ?? "a friend"} a reminder</>;
    default: return <>{who} did something</>;
  }
}

/** The right-hand money column: what this change means for the viewer's pocket. */
function AmountCell({ it, meId }: { it: Item; meId: Id<"users"> | undefined }) {
  const currency = currencyOf(it);
  if (!currency) return null;
  const net = it.expense?.myNet ?? null;
  const amount = amountOf(it);
  const p = it.payload as { payerId?: string; payeeId?: string };
  let value: ReactNode = null; let label = "";
  switch (it.type) {
    case "expense_added": case "expense_updated": case "expense_restored":
      if (!net) return null;
      value = <Money minor={net} currency={currency} tone="auto" signDisplay="always" />;
      label = net > 0 ? "you get back" : "you owe";
      break;
    case "expense_deleted": case "payment_deleted":
      if (amount === null) return null;
      value = <Money minor={amount} currency={currency} tone="muted" className="line-through decoration-text-faint" />;
      label = "removed";
      break;
    case "payment_recorded":
      if (amount === null) return null;
      if (p.payeeId === meId) { value = <Money minor={amount} currency={currency} tone="positive" signDisplay="always" />; label = "you received"; }
      else if (p.payerId === meId) { value = <Money minor={amount} currency={currency} />; label = "you paid"; }
      else { value = <Money minor={amount} currency={currency} tone="muted" />; label = "settled"; }
      break;
    default: return null;
  }
  return (
    <div className="shrink-0 pt-px text-right">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-text-faint text-[11px]">{label}</div>
    </div>
  );
}

// ---------- grouping ----------

type Entry = { kind: "single"; item: Item } | { kind: "burst"; items: Item[] };
type Cluster = { key: string; group: Item["group"]; label: string; items: Item[]; entries: Entry[] };
type Day = { key: string; label: string; items: Item[]; clusters: Cluster[] };

const BURST_TYPES = new Set<Item["type"]>(["expense_added", "expense_deleted"]);
const BURST_WINDOW = 10 * 60_000;

/** Several of the same change by one person in a few minutes read as one event: "deleted 4 expenses". */
function collapseBursts(items: Item[]): Entry[] {
  const out: Entry[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    const prevItems = prev?.kind === "burst" ? prev.items : prev?.kind === "single" ? [prev.item] : null;
    const head = prevItems?.[prevItems.length - 1];
    if (
      head && BURST_TYPES.has(it.type) && head.type === it.type && head.actor?._id === it.actor?._id &&
      head.createdAt - it.createdAt < BURST_WINDOW && currencyOf(head) === currencyOf(it)
    ) {
      out[out.length - 1] = { kind: "burst", items: [...prevItems!, it] };
    } else {
      out.push({ kind: "single", item: it });
    }
  }
  return out;
}

function clusterKey(it: Item): string {
  if (it.group) return it.group._id;
  if (it.type === "friend_added" || it.type === "reminder_sent") return "friends";
  return "none";
}

function groupByDay(items: Item[]): Day[] {
  const days: Day[] = [];
  for (const it of items) {
    const d = new Date(it.createdAt);
    const key = format(d, "yyyy-MM-dd");
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, isThisYear(d) ? "EEE, d MMM" : "EEE, d MMM yyyy");
      day = { key, label, items: [], clusters: [] };
      days.push(day);
    }
    day.items.push(it);
    const ck = clusterKey(it);
    let cluster = day.clusters.find((c) => c.key === ck);
    if (!cluster) {
      cluster = { key: ck, group: it.group, label: it.group?.name ?? (ck === "friends" ? "Friends" : "Not in a group"), items: [], entries: [] };
      day.clusters.push(cluster);
    }
    cluster.items.push(it);
  }
  for (const day of days) for (const c of day.clusters) c.entries = collapseBursts(c.items);
  return days;
}

// ---------- components ----------

function NetLabel({ net, className }: { net: ReturnType<typeof netOf>; className?: string }) {
  if (!net) return null;
  return <Money minor={net.minor} currency={net.currency} tone="auto" signDisplay="always" className={cn("text-xs font-semibold", className)} />;
}

function Row({ it, meId }: { it: Item; meId: Id<"users"> | undefined }) {
  const p = it.payload as { content?: string };
  return (
    <li className={cn("relative flex gap-3 px-3.5 py-2.5", !it.read && "bg-brand-soft/35")}>
      {!it.read ? <span className="bg-brand absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full" aria-label="Unread" /> : null}
      <div className="relative shrink-0 self-start">
        {it.actor ? <UserAvatar user={it.actor} size="sm" /> : <div className="size-8" />}
        <TypeBadge type={it.type} />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <div>{describe(it, meId)}</div>
        {it.type === "comment_added" && p.content ? (
          <div className="bg-surface-2 text-text-muted border-line-strong mt-1 rounded-r-lg border-l-2 px-2.5 py-1 text-[13px] italic">{p.content}</div>
        ) : null}
        <div className="text-text-faint mt-0.5 text-xs">{format(it.createdAt, "h:mm a")}</div>
      </div>
      <AmountCell it={it} meId={meId} />
    </li>
  );
}

function BurstRow({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const head = items[0];
  const who = head.isMe ? "You" : head.actor?.name ?? "Someone";
  const verb = head.type === "expense_deleted" ? "deleted" : "added";
  const currency = currencyOf(head);
  const total = items.reduce((s, it) => s + (amountOf(it) ?? 0), 0);
  const unread = items.some((it) => !it.read);
  const shown = open ? items : items.slice(0, 3);
  const deleted = head.type === "expense_deleted";
  return (
    <li className={cn("relative flex gap-3 px-3.5 py-2.5", unread && "bg-brand-soft/35")}>
      {unread ? <span className="bg-brand absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full" aria-label="Unread" /> : null}
      <div className="relative shrink-0 self-start">
        {head.actor ? <UserAvatar user={head.actor} size="sm" /> : <div className="size-8" />}
        <TypeBadge type={head.type} />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <div>{who} {verb} <span className="font-medium">{items.length} expenses</span></div>
        <div className="text-text-muted mt-0.5 text-[13px] leading-relaxed">
          {shown.map((it, i) => (
            <span key={it._id}>
              {i > 0 ? " · " : ""}
              {it.expense && !deleted ? (
                <Link to={`/expenses/${it.expense._id}`} className="hover:underline">{it.expense.description}</Link>
              ) : (
                <span className={cn(deleted && "line-through decoration-text-faint")}>{it.expense?.description ?? String((it.payload as { description?: string }).description ?? "")}</span>
              )}
            </span>
          ))}
          {items.length > 3 ? (
            <>
              {" · "}
              <button type="button" className="text-brand font-semibold hover:underline" onClick={() => setOpen((o) => !o)}>
                {open ? "Show fewer" : `+${items.length - 3} more`}
              </button>
            </>
          ) : null}
        </div>
        <div className="text-text-faint mt-0.5 text-xs">{[...new Set([format(items[items.length - 1].createdAt, "h:mm a"), format(head.createdAt, "h:mm a")])].join(" – ")}</div>
      </div>
      {currency && total > 0 ? (
        <div className="shrink-0 pt-px text-right">
          <div className="text-sm font-semibold"><Money minor={total} currency={currency} tone="muted" className={cn(deleted && "line-through decoration-text-faint")} /></div>
          <div className="text-text-faint text-[11px]">{deleted ? "removed" : "added"}</div>
        </div>
      ) : null}
    </li>
  );
}

function ClusterBlock({ cluster, meId }: { cluster: Cluster; meId: Id<"users"> | undefined }) {
  const net = netOf(cluster.items);
  const g = cluster.group;
  const head = (
    <>
      {g ? (
        <GroupAvatar group={g} size="xs" className="rounded-md" />
      ) : (
        <span className="bg-surface-2 text-text-faint flex size-6 items-center justify-center rounded-md">
          {cluster.key === "friends" ? <UserRound className="size-3.5" /> : <Receipt className="size-3.5" />}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate text-[13px] font-semibold", !g && "text-text-faint font-medium")}>{cluster.label}</span>
      <NetLabel net={net} />
      {g && !g.deleted ? <ChevronRight className="text-text-faint size-3.5" /> : null}
    </>
  );
  return (
    <div className="border-bg border-t-[6px] first:border-t-0">
      {g && !g.deleted ? (
        <Link to={`/groups/${g._id}`} className="hover:bg-surface-2/60 flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">{head}</Link>
      ) : (
        <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">{head}</div>
      )}
      <ul className="divide-line divide-y">
        {cluster.entries.map((e) => (e.kind === "burst" ? <BurstRow key={e.items[0]._id} items={e.items} /> : <Row key={e.item._id} it={e.item} meId={meId} />))}
      </ul>
    </div>
  );
}

function DaySection({ day, meId }: { day: Day; meId: Id<"users"> | undefined }) {
  const net = netOf(day.items);
  return (
    <section aria-label={day.label}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-text-muted text-[13px] font-semibold tracking-wide">{day.label}</h2>
        <NetLabel net={net} />
      </div>
      <div className="card overflow-hidden">
        {day.clusters.map((c) => <ClusterBlock key={c.key} cluster={c} meId={meId} />)}
      </div>
    </section>
  );
}

function Chip({ active, children, ...props }: { active?: boolean; children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cn(
        "pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap",
        active ? "bg-text text-bg" : "bg-surface text-text-muted shadow-card hover:bg-surface-2",
        props.className,
      )}
    >
      {children}
    </button>
  );
}

function DateFilter({ period, custom, onChange }: { period: Period; custom: { from: number; to: number }; onChange: (p: Period, custom?: { from: number; to: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(custom);
  const active = period !== "any";
  return (
    <Popover open={open} onOpenChange={(o) => { if (o) setDraft(custom); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Chip active={active} className={cn(active && "bg-brand text-on-brand")} aria-label="Filter by date">
          <CalendarDays className="size-3.5" />
          {periodLabel(period, custom)}
          <ChevronDown className="size-3.5 opacity-70" />
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <ul role="radiogroup" aria-label="Show activity from">
          {PERIODS.map((p) => (
            <li key={p.value}>
              <button
                type="button"
                role="radio"
                aria-checked={period === p.value}
                className={cn("hover:bg-surface-2 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm", period === p.value && "font-semibold")}
                onClick={() => { onChange(p.value); setOpen(false); }}
              >
                {p.label}
                {period === p.value ? <span className="bg-brand size-1.5 rounded-full" /> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-line mt-1 border-t px-2.5 pt-2.5 pb-1">
          <div className={cn("mb-1.5 text-sm", period === "custom" && "font-semibold")}>Custom range</div>
          <div className="grid grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-1.5 text-[13px]">
            <label htmlFor="activity-from" className="text-text-muted">From</label>
            <Input id="activity-from" type="date" className="bg-surface-2 h-8 min-w-0 rounded-lg px-2 text-[13px] shadow-none" value={toDateInputValue(draft.from)} max={toDateInputValue(draft.to)} onChange={(e) => e.target.value && setDraft((d) => ({ ...d, from: fromDateInputValue(e.target.value, d.from) }))} />
            <label htmlFor="activity-to" className="text-text-muted">To</label>
            <Input id="activity-to" type="date" className="bg-surface-2 h-8 min-w-0 rounded-lg px-2 text-[13px] shadow-none" value={toDateInputValue(draft.to)} min={toDateInputValue(draft.from)} onChange={(e) => e.target.value && setDraft((d) => ({ ...d, to: fromDateInputValue(e.target.value, d.to) }))} />
          </div>
          <Button size="sm" className="mt-2 w-full" onClick={() => { onChange("custom", draft); setOpen(false); }}>Apply range</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const PAGE = 40;

export function ActivityPage() {
  const me = useMe();
  const [kind, setKind] = useState<Kind | "all">("all");
  const [period, setPeriod] = useState<Period>("any");
  const [custom, setCustom] = useState(() => ({ from: startOfToday().getTime(), to: startOfToday().getTime() }));
  const [cursors, setCursors] = useState<number[]>([]);
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const filterArgs = { kind: kind === "all" ? undefined : kind, after: range.after };

  const first = useQuery(api.activity.feed, { limit: PAGE, before: range.before, ...filterArgs });
  const more = useQuery(api.activity.feed, cursors.length > 0 ? { limit: PAGE, before: cursors[cursors.length - 1], ...filterArgs } : "skip");
  const firstShown = useLastDefined(first);
  const markRead = useMutation(api.activity.markAllRead);
  useEffect(() => {
    if (first && first.items.some((i) => !i.read)) void markRead();
  }, [first, markRead]);

  const moreItems = cursors.length > 0 && more ? more.items : undefined;
  const items = useMemo(() => (firstShown ? [...firstShown.items, ...(moreItems ?? [])] : undefined), [firstShown, moreItems]);
  const last = cursors.length > 0 ? more : first;
  const days = useMemo(() => (items ? groupByDay(items) : []), [items]);
  const filtered = kind !== "all" || period !== "any";

  const select = (next: Partial<{ kind: Kind | "all"; period: Period; custom: { from: number; to: number } }>) => {
    if (next.kind !== undefined) setKind(next.kind);
    if (next.period !== undefined) setPeriod(next.period);
    if (next.custom !== undefined) setCustom(next.custom);
    setCursors([]);
  };
  const noun = (n: number) => { const k = KINDS.find((x) => x.value === kind) ?? KINDS[0]; return n === 1 ? k.noun[0] : k.noun[1]; };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Recent activity" />

      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="toolbar" aria-label="Filter activity">
        <DateFilter period={period} custom={custom} onChange={(p, c) => select({ period: p, custom: c })} />
        <span className="bg-line-strong mx-0.5 h-5 w-px shrink-0" aria-hidden />
        {KINDS.map((k) => (
          <Chip key={k.value} active={kind === k.value} onClick={() => select({ kind: k.value })}>{k.label}</Chip>
        ))}
      </div>

      {filtered && items && items.length > 0 ? (
        <div className="text-text-muted mb-3 flex items-center justify-between px-1 text-[13px]">
          <span>
            <span className="text-text font-semibold">{items.length}{last?.nextBefore ? "+" : ""}</span> {noun(items.length)}
            {period !== "any" ? <> · {periodLabel(period, custom)}</> : null}
          </span>
          <button type="button" className="text-brand inline-flex items-center gap-1 font-semibold hover:underline" onClick={() => select({ kind: "all", period: "any" })}>
            <X className="size-3.5" /> Clear
          </button>
        </div>
      ) : null}

      {items === undefined ? (
        <RowSkeleton />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Activity}
            title={`No ${noun(2)} ${period === "any" ? "yet" : periodLabel(period, custom).toLowerCase()}`}
            description="Try a wider date range or a different type."
            action={
              <div className="flex gap-2">
                {period !== "any" ? <Button variant="outline" size="sm" onClick={() => select({ period: "any" })}>Show any time</Button> : null}
                <Button variant="outline" size="sm" onClick={() => select({ kind: "all", period: "any" })}>Clear filters</Button>
              </div>
            }
          />
        ) : (
          <EmptyState icon={Activity} title="No activity yet" description="When you or your friends add expenses, settle up or change a group, it shows up here." />
        )
      ) : (
        <div className={cn("flex flex-col gap-5", first === undefined && "opacity-60 transition-opacity")}>
          {days.map((d) => <DaySection key={d.key} day={d} meId={me?._id} />)}
        </div>
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
