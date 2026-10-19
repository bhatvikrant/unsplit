import { useMutation, useQuery } from "@/lib/convex";
import { ArrowLeft, Pencil, Repeat, Send, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { categoryBySlug } from "@convex/lib/categories";
import { REPEAT_LABELS } from "@convex/lib/recurring";
import { UserAvatar } from "@/components/common/Avatars";
import { CategoryIcon, RowSkeleton, Section } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { SwipeToDelete, useSwipedRow } from "@/components/common/SwipeToDelete";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatDate, relativeTime } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { NotFound } from "./NotFound";

const SPLIT_LABEL: Record<string, string> = { equal: "equally", exact: "by exact amounts", percent: "by percentages", shares: "by shares", adjustment: "with adjustments", reimbursement: "as a reimbursement", itemized: "item by item" };

export function ExpenseDetail() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const expense = useQuery(api.expenses.get, id ? { id: id as Id<"expenses"> } : "skip");
  const remove = useMutation(api.expenses.remove);
  const restore = useMutation(api.expenses.restore);
  const cancelRecurring = useMutation(api.expenses.cancelRecurring);
  const addComment = useMutation(api.comments.add);
  const removeComment = useMutation(api.comments.remove);
  const confirm = useConfirm();
  const swipe = useSwipedRow();
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => expense === undefined && setFailed(true), 8000);
    return () => clearTimeout(t);
  }, [expense]);

  if (expense === undefined) {
    if (error || failed) return <NotFound />;
    return <RowSkeleton count={3} />;
  }
  const e = expense;
  const cat = categoryBySlug(e.category);
  const payers = e.shares.filter((s) => s.paidMinor > 0);
  const owers = e.shares.filter((s) => s.owedMinor > 0);
  const mine = e.shares.find((s) => s.userId === me?._id);
  const net = mine ? mine.paidMinor - mine.owedMinor : 0;
  const back = e.group ? `/groups/${e.group._id}` : e.friend ? `/friends/${e.friend._id}` : "/expenses";

  const post = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await addComment({ expenseId: e._id, content: comment });
      setComment("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link to={back}>
            <ArrowLeft /> {e.group ? e.group.name : e.friend ? e.friend.name : "All expenses"}
          </Link>
        </Button>
        {e.deletedAt ? (
          <div className="bg-negative-soft text-negative mb-3 flex items-center justify-between rounded-md px-3 py-2 text-sm">
            <span>This {e.isPayment ? "payment" : "expense"} was deleted {relativeTime(e.deletedAt)}.</span>
            <Button size="sm" variant="outline" onClick={() => restore({ id: e._id }).catch((err) => toast.error(errorMessage(err)))}>
              <Undo2 /> Restore
            </Button>
          </div>
        ) : null}
        <div className="flex items-start gap-4">
          <CategoryIcon slug={e.isPayment ? "payment" : e.category} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-text text-xl font-semibold break-words">{e.description}</h1>
            <div className="text-text mt-0.5 text-2xl font-semibold">
              <Money minor={e.amountMinor} currency={e.currency} />
              {e.originalCurrency && e.originalCurrency !== e.currency && e.originalAmountMinor !== undefined ? (
                <span className="text-text-faint ml-2 text-sm font-normal">
                  (was <Money minor={e.originalAmountMinor} currency={e.originalCurrency} />)
                </span>
              ) : null}
            </div>
            <div className="text-text-muted mt-1 text-sm">
              {formatDate(e.date, "long")} · {e.isPayment ? "Payment" : cat.name}
              {e.group ? <> · <Link to={`/groups/${e.group._id}`} className="hover:underline">{e.group.name}</Link></> : e.friend ? <> · with <Link to={`/friends/${e.friend._id}`} className="hover:underline">{e.friend.name}</Link></> : null}
            </div>
            <div className="text-text-faint mt-1 text-xs">
              Added by {e.createdByUser?.name ?? "someone"} {relativeTime(e._creationTime)}
              {e.updatedAt - e._creationTime > 60_000 ? <> · last changed by {e.updatedByUser?.name ?? "someone"} {relativeTime(e.updatedAt)}</> : null}
            </div>
          </div>
          {!e.deletedAt ? (
            <div className="flex shrink-0 gap-1">
              {!e.isPayment ? (
                <Button variant="outline" size="sm" onClick={() => dialogs.addExpense({ expenseId: e._id })}>
                  <Pencil /> Edit
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                aria-label={e.isPayment ? "Delete payment" : "Delete expense"}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete this ${e.isPayment ? "payment" : "expense"}?`, description: "Balances update right away. Anyone involved can restore it later from Deleted items.", action: "Delete" }))) return;
                  try {
                    await remove({ id: e._id });
                    toast.success("Deleted", { action: { label: "Undo", onClick: () => void restore({ id: e._id }) } });
                    navigate(back);
                  } catch (err) {
                    setError(errorMessage(err));
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {e.repeat !== "never" && e.nextRepeatAt ? (
        <div className="bg-surface flex items-center gap-3 rounded-md px-3 py-2 text-sm">
          <Repeat className="text-text-muted size-4" />
          <span className="flex-1">
            {REPEAT_LABELS[e.repeat]}. Next on {formatDate(e.nextRepeatAt, "long")}.{e.emailReminder ? " Everyone gets an email the day before." : ""}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!(await confirm({ title: "Stop repeating this expense?", description: "Expenses already posted stay. No new ones are added.", action: "Stop repeating" }))) return;
              cancelRecurring({ id: e._id }).catch((err) => toast.error(errorMessage(err)));
            }}
          >
            Cancel future recurrences
          </Button>
        </div>
      ) : e.recurringParentId ? (
        <div className="text-text-muted text-xs">Posted automatically from a recurring expense.</div>
      ) : null}

      <Section title={e.isPayment ? "Payment" : `Split ${SPLIT_LABEL[e.splitMethod] ?? ""}`}>
        <div className="grid gap-0 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="p-3">
            <div className="text-text-faint mb-2 text-xs font-medium">{e.isPayment ? "Paid by" : payers.length > 1 ? "Paid by" : "Paid by"}</div>
            <ul className="space-y-2">
              {payers.map((s) => (
                <li key={s.userId} className="flex items-center gap-2 text-sm">
                  {s.user ? <UserAvatar user={s.user} size="xs" /> : null}
                  <span className="flex-1 truncate">{s.user?.name ?? "Someone"}</span>
                  <Money minor={s.paidMinor} currency={e.currency} className="font-medium" />
                </li>
              ))}
            </ul>
          </div>
          <div className="p-3">
            <div className="text-text-faint mb-2 text-xs font-medium">{e.isPayment ? "Paid to" : "Owes"}</div>
            <ul className="space-y-2">
              {owers.map((s) => (
                <li key={s.userId} className="flex items-center gap-2 text-sm">
                  {s.user ? <UserAvatar user={s.user} size="xs" /> : null}
                  <span className="flex-1 truncate">{s.user?.name ?? "Someone"}</span>
                  <Money minor={s.owedMinor} currency={e.currency} className="font-medium" />
                </li>
              ))}
            </ul>
          </div>
        </div>
        {mine && net !== 0 ? (
          <div className="border-t px-3 py-2 text-sm">
            {e.isPayment ? (
              <>You {net > 0 ? "paid" : "received"} <Money minor={net} currency={e.currency} abs className="font-medium" />.</>
            ) : net > 0 ? (
              <>You lent <Money minor={net} currency={e.currency} tone="positive" className="font-medium" /> on this.</>
            ) : (
              <>You borrowed <Money minor={net} currency={e.currency} abs tone="negative" className="font-medium" /> on this.</>
            )}
          </div>
        ) : null}
        {e.splitSpec?.method === "itemized" ? (
          <div className="border-t p-3">
            <div className="text-text-faint mb-2 text-xs font-medium">Items</div>
            <ul className="space-y-1 text-sm">
              {e.splitSpec.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {it.name} <span className="text-text-faint">· {it.assigneeIds.map((id) => e.participants.find((p) => p._id === id)?.name.split(" ")[0] ?? "?").join(", ")}</span>
                  </span>
                  <Money minor={it.amountMinor} currency={e.currency} />
                </li>
              ))}
              {e.splitSpec.taxMinor ? <li className="text-text-muted flex justify-between"><span>Tax</span><Money minor={e.splitSpec.taxMinor} currency={e.currency} /></li> : null}
              {e.splitSpec.tipMinor ? <li className="text-text-muted flex justify-between"><span>Tip</span><Money minor={e.splitSpec.tipMinor} currency={e.currency} /></li> : null}
              {e.splitSpec.discountMinor ? <li className="text-text-muted flex justify-between"><span>Discount</span><Money minor={-e.splitSpec.discountMinor} currency={e.currency} /></li> : null}
            </ul>
          </div>
        ) : null}
      </Section>

      {e.notes ? (
        <Section title="Notes">
          <p className="px-3 py-2.5 text-sm whitespace-pre-wrap">{e.notes}</p>
        </Section>
      ) : null}

      {e.receiptUrl ? (
        <Section title="Receipt">
          <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="block p-3">
            <img src={e.receiptUrl} alt="Receipt" className="max-h-96 rounded-xl shadow-card object-contain" />
          </a>
        </Section>
      ) : null}

      <Section title="Comments">
        <ul className="divide-y">
          {e.comments.length === 0 ? <li className="text-text-faint px-3 py-3 text-sm">No comments yet.</li> : null}
          {e.comments.map((c) => (
            <li key={c._id}>
              <SwipeToDelete
                {...swipe.row(c._id)}
                disabled={c.user?._id !== me?._id}
                onDelete={async () => {
                  if (await confirm({ title: "Delete this comment?", action: "Delete" })) removeComment({ commentId: c._id }).catch((err) => toast.error(errorMessage(err)));
                  swipe.close();
                }}
                className="rounded-none"
              >
                <div className="flex gap-3 px-3 py-2.5">
                  {c.user ? <UserAvatar user={c.user} size="xs" /> : null}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{c.user?.name ?? "Someone"}</span>
                      <span className="text-text-faint text-xs">{relativeTime(c.createdAt)}</span>
                      {c.user?._id === me?._id ? (
                        <button
                          type="button"
                          aria-label="Delete comment"
                          className="text-text-faint hover:text-danger ml-auto text-xs"
                          onClick={async () => {
                            if (!(await confirm({ title: "Delete this comment?", action: "Delete" }))) return;
                            removeComment({ commentId: c._id }).catch((err) => toast.error(errorMessage(err)));
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              </SwipeToDelete>
            </li>
          ))}
        </ul>
        <form onSubmit={post} className="flex gap-2 border-t p-3">
          <Textarea aria-label="Add a comment" rows={1} placeholder="Add a comment" value={comment} onChange={(ev) => setComment(ev.target.value)} className="min-h-9" onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); void post(ev); } }} />
          <Button type="submit" size="icon" disabled={posting || !comment.trim()} aria-label="Post comment">
            <Send />
          </Button>
        </form>
      </Section>

      <Section title="History">
        <ul className="divide-y text-sm">
          {e.history.map((h) => {
            const p = h.payload as { changed?: Record<string, { from: unknown; to: unknown }> };
            const changedKeys = p.changed ? Object.keys(p.changed).filter((k) => k !== "shares") : [];
            const label = ({ expense_added: "added", expense_updated: "updated", expense_deleted: "deleted", expense_restored: "restored", payment_recorded: "recorded", payment_deleted: "deleted", comment_added: "commented on", currency_converted: "converted" } as Record<string, string>)[h.type] ?? h.type;
            return (
              <li key={h._id} className="px-3 py-2">
                <span className="font-medium">{h.actor?.name ?? "Someone"}</span> {label} this {relativeTime(h.createdAt)}
                {changedKeys.length > 0 ? <span className="text-text-muted"> · changed {changedKeys.join(", ")}{p.changed?.shares ? ", split" : ""}</span> : null}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
