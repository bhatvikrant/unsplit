import { CloudOff, Paperclip, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage, formatDate, monthKey, monthLabel } from "@/lib/format";
import { isTempId, useMutation } from "@/lib/convex";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useConfirm } from "./ConfirmDialog";
import { CategoryIcon, RowSkeleton } from "./Misc";
import { Money } from "./Money";
import { SwipeToDelete, useSwipedRow, type SwipeRowState } from "./SwipeToDelete";

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

/**
 * Asks, soft-deletes, and offers Undo: the same flow the detail page uses. Resolves once the
 * question is answered, whichever way, so a swiped-open row can close.
 */
export function useDeleteExpense() {
  const confirm = useConfirm();
  const remove = useMutation(api.expenses.remove);
  const restore = useMutation(api.expenses.restore);
  return async (item: Pick<ExpenseListItem, "_id" | "isPayment">) => {
    const what = item.isPayment ? "payment" : "expense";
    if (!(await confirm({ title: `Delete this ${what}?`, description: "Balances update right away. Anyone involved can restore it later from Deleted items.", action: "Delete" }))) return;
    try {
      await remove({ id: item._id });
      toast.success("Deleted", { action: { label: "Undo", onClick: () => void restore({ id: item._id }) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

export function ExpenseRow({
  item,
  showGroup,
  trailing,
  swipe,
  onDelete,
}: {
  item: ExpenseListItem;
  showGroup?: boolean;
  trailing?: ReactNode;
  /** With `onDelete`, the row slides left to uncover Delete. Rows not yet synced or already deleted stay put. */
  swipe?: SwipeRowState;
  onDelete?: () => void;
}) {
  const me = useMe();
  const net = item.mine ? item.mine.paidMinor - item.mine.owedMinor : null;
  const payerText = item.payers.length === 0 ? "" : item.payers.length === 1 ? (item.payers[0].userId === me?._id ? "You" : item.payers[0].name) : `${item.payers.length} people`;
  const paymentText = item.isPayment
    ? `${item.payers[0]?.userId === me?._id ? "You" : item.payers[0]?.name} paid ${item.payees[0]?.userId === me?._id ? "you" : item.payees[0]?.name}`
    : null;
  const [mon] = formatDate(item.date, "monthDay").split(" ");

  const link = (
    <Link
      to={`/expenses/${item._id}`}
      className={cn(
        "hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-3 rounded-[10px] px-3 py-2.5 outline-none transition-colors duration-100 focus-visible:ring-[3px]",
        item.deletedAt && "opacity-60",
      )}
    >
      <div className="w-9 shrink-0 text-center leading-none">
        <div className="text-text-faint text-[10px] font-semibold tracking-[0.06em] uppercase">{mon}</div>
        <div className="text-text tnum mt-0.5 text-[17px] font-semibold tracking-[-0.02em]">{new Date(item.date).getDate()}</div>
      </div>
      <CategoryIcon slug={item.isPayment ? "payment" : item.category} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm font-medium", item.deletedAt && "line-through")}>{paymentText ?? item.description}</span>
          {item.repeat !== "never" ? <Repeat className="text-text-faint size-3.5 shrink-0" aria-label="Recurring" /> : null}
          {item.hasReceipt ? <Paperclip className="text-text-faint size-3.5 shrink-0" aria-label="Has receipt" /> : null}
          {isTempId(item._id) ? <CloudOff className="text-text-faint size-3.5 shrink-0" aria-label="Not synced yet" /> : null}
        </div>
        <div className="text-text-faint truncate text-[12.5px]">
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
      <div className="shrink-0 text-right leading-tight">
        {net === null ? (
          <span className="text-text-faint text-xs">not involved</span>
        ) : net === 0 ? (
          <span className="text-text-faint text-xs">{item.isPayment ? "" : "no balance"}</span>
        ) : (
          <>
            <div className={cn("text-[11.5px] font-medium", net > 0 ? "text-positive" : "text-negative")}>{item.isPayment ? (net > 0 ? "you paid" : "you received") : net > 0 ? "you lent" : "you borrowed"}</div>
            <Money minor={net} currency={item.currency} abs tone={net > 0 ? "positive" : "negative"} className="text-[14.5px] font-semibold tracking-[-0.01em]" />
          </>
        )}
      </div>
      {trailing}
    </Link>
  );

  return (
    <li>
      {swipe && onDelete ? (
        <SwipeToDelete {...swipe} onDelete={onDelete} disabled={isTempId(item._id) || !!item.deletedAt}>
          {link}
        </SwipeToDelete>
      ) : (
        link
      )}
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
  const swipe = useSwipedRow();
  const del = useDeleteExpense();
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
    <div className="card px-1 pb-1">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="text-text-faint px-3 pt-3.5 pb-1.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase">{monthLabel(g.key)}</h3>
          <ul>
            {g.items.map((it) => (
              <ExpenseRow key={it._id} item={it} showGroup={showGroup} swipe={swipe.row(it._id)} onDelete={() => del(it).finally(swipe.close)} />
            ))}
          </ul>
        </section>
      ))}
      {hasMore ? (
        <div className="flex justify-center py-3">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
