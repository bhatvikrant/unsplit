import { motion } from "framer-motion";
import { ArrowLeftRight, Paperclip, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatDate, monthKey, monthLabel } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CategoryIcon, RowSkeleton } from "./Misc";
import { Money } from "./Money";

export type ExpenseListItem = {
  _id: Id<"expenses">;
  description: string;
  amountMinor: number;
  currency: string;
  date: number;
  category: string;
  isPayment: boolean;
  repeat: string;
  groupId: Id<"groups"> | null;
  groupName: string | null;
  payers: { userId: Id<"users">; name: string; paidMinor: number }[];
  payees: { userId: Id<"users">; name: string; owedMinor: number }[];
  mine: { paidMinor: number; owedMinor: number } | null;
  hasReceipt: boolean;
  deletedAt: number | null;
};

export function ExpenseRow({ item, showGroup, trailing }: { item: ExpenseListItem; showGroup?: boolean; trailing?: ReactNode }) {
  const me = useMe();
  const net = item.mine ? item.mine.paidMinor - item.mine.owedMinor : null;
  const payerText = item.payers.length === 0 ? "" : item.payers.length === 1 ? (item.payers[0].userId === me?._id ? "You" : item.payers[0].name) : `${item.payers.length} people`;
  const paymentText = item.isPayment
    ? `${item.payers[0]?.userId === me?._id ? "You" : item.payers[0]?.name} paid ${item.payees[0]?.userId === me?._id ? "you" : item.payees[0]?.name}`
    : null;

  return (
    <li>
      <Link
        to={`/expenses/${item._id}`}
        className={cn("hover:bg-surface focus-visible:ring-ring/50 flex items-center gap-3 rounded-md px-2 py-2.5 outline-none focus-visible:ring-[3px]", item.deletedAt && "opacity-60")}
      >
        <div className="text-text-faint w-9 shrink-0 text-center text-xs leading-tight">
          <div className="uppercase">{formatDate(item.date, "monthDay").split(" ")[0]}</div>
          <div className="text-text text-base font-semibold">{new Date(item.date).getDate()}</div>
        </div>
        {item.isPayment ? (
          <div className="bg-positive-soft text-positive flex size-9 shrink-0 items-center justify-center rounded-md">
            <ArrowLeftRight className="size-4" />
          </div>
        ) : (
          <CategoryIcon slug={item.category} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm font-medium", item.deletedAt && "line-through")}>{paymentText ?? item.description}</span>
            {item.repeat !== "never" ? <Repeat className="text-text-faint size-3.5 shrink-0" aria-label="Recurring" /> : null}
            {item.hasReceipt ? <Paperclip className="text-text-faint size-3.5 shrink-0" aria-label="Has receipt" /> : null}
          </div>
          <div className="text-text-muted truncate text-xs">
            {item.isPayment ? (
              <Money minor={item.amountMinor} currency={item.currency} />
            ) : (
              <>
                {payerText} paid <Money minor={item.amountMinor} currency={item.currency} />
              </>
            )}
            {showGroup && item.groupName ? <span> · {item.groupName}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {net === null ? (
            <span className="text-text-faint text-xs">not involved</span>
          ) : net === 0 ? (
            <span className="text-text-faint text-xs">{item.isPayment ? "" : "no balance"}</span>
          ) : (
            <>
              <div className={cn("text-xs", net > 0 ? "text-positive" : "text-negative")}>{item.isPayment ? (net > 0 ? "you paid" : "you received") : net > 0 ? "you lent" : "you borrowed"}</div>
              <Money minor={net} currency={item.currency} abs tone={net > 0 ? "positive" : "negative"} className="text-sm font-semibold" />
            </>
          )}
        </div>
        {trailing}
      </Link>
    </li>
  );
}

export function ExpenseList({
  items,
  hasMore,
  onLoadMore,
  loadingMore,
  showGroup,
  empty,
}: {
  items: ExpenseListItem[] | undefined;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  showGroup?: boolean;
  empty: ReactNode;
}) {
  if (items === undefined) return <RowSkeleton count={6} />;
  if (items.length === 0) return <>{empty}</>;
  const groups: { key: string; items: ExpenseListItem[] }[] = [];
  for (const it of items) {
    const k = monthKey(it.date);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(it);
    else groups.push({ key: k, items: [it] });
  }
  return (
    <div>
      {groups.map((g) => (
        <motion.section key={g.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          <h3 className="text-text-faint sticky top-14 z-10 bg-bg/95 px-2 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase backdrop-blur">{monthLabel(g.key)}</h3>
          <ul className="divide-y">
            {g.items.map((it) => (
              <ExpenseRow key={it._id} item={it} showGroup={showGroup} />
            ))}
          </ul>
        </motion.section>
      ))}
      {hasMore ? (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
