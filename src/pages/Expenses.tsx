import { useMutation, useQuery } from "@/lib/convex";
import { Plus, ReceiptText, Repeat, Search, Trash2, Undo2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { REPEAT_LABELS } from "@convex/lib/recurring";
import { GroupAvatar } from "@/components/common/Avatars";
import { ExpenseList, ExpenseRow } from "@/components/common/ExpenseList";
import { EmptyState, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, formatDate, relativeTime } from "@/lib/format";
import { usePagedExpenses } from "@/lib/usePagedExpenses";

export function AllExpenses() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const { items, hasMore, loadMore, loadingMore } = usePagedExpenses({ search: q || undefined });
  const dialogs = useDialogs();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={q ? `Search: ${q}` : "All expenses"}
        actions={
          <Button onClick={() => dialogs.addExpense()}>
            <Plus /> Add expense
          </Button>
        }
      />
      <form
        role="search"
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(text.trim() ? { q: text.trim() } : {});
        }}
      >
        <div className="relative flex-1">
          <Search className="text-text-faint pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input aria-label="Search expenses" placeholder="Search by description or notes" className="pl-9" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q ? (
          <Button type="button" variant="ghost" onClick={() => setParams({})}>
            Clear
          </Button>
        ) : null}
      </form>
      <ExpenseList
        items={items}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        showGroup
        empty={
          q ? (
            <EmptyState icon={Search} title="No matches" description={`Nothing matches "${q}".`} />
          ) : (
            <EmptyState icon={ReceiptText} title="No expenses yet" description="Add your first shared expense." action={<Button onClick={() => dialogs.addExpense()}><Plus /> Add expense</Button>} />
          )
        }
      />
    </div>
  );
}

export function RecurringExpenses() {
  const items = useQuery(api.expenses.recurring);
  const cancel = useMutation(api.expenses.cancelRecurring);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Recurring expenses" subtitle="Each one posts automatically. The newest copy carries the schedule, so edit that one to change future amounts." />
      {items === undefined ? (
        <RowSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Repeat} title="Nothing repeats yet" description="When you add an expense, choose a repeat interval to make it recurring." />
      ) : (
        <ul className="card divide-y px-1">
          {items.map((it) => (
            <ExpenseRow
              key={it._id}
              item={it}
              showGroup
              trailing={
                <div className="ml-2 flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span className="text-text-muted">{REPEAT_LABELS[it.repeat]}</span>
                  <span className="text-text-faint">next {formatDate(it.nextRepeatAt)}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async (e) => {
                      e.preventDefault();
                      try {
                        await cancel({ id: it._id });
                        toast.success("Future recurrences cancelled");
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  >
                    Stop repeating
                  </Button>
                </div>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrashPage() {
  const deletedExpenses = useQuery(api.expenses.deleted);
  const deletedGroups = useQuery(api.groups.listDeleted);
  const restoreExpense = useMutation(api.expenses.restore);
  const restoreGroup = useMutation(api.groups.restore);
  const navigate = useNavigate();
  // Offline, one list may be cached and the other never fetched: show what we have.
  const loading = deletedExpenses === undefined && deletedGroups === undefined;
  const expenses = deletedExpenses ?? [];
  const groups = deletedGroups ?? [];
  const empty = expenses.length === 0 && groups.length === 0;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Deleted items" subtitle="Anything deleted can be restored by anyone involved." />
      {loading ? (
        <RowSkeleton />
      ) : empty ? (
        <EmptyState icon={Trash2} title="Nothing deleted" description="Deleted expenses and groups will show up here." />
      ) : (
        <>
          {groups.length > 0 ? (
            <Section title="Groups">
              <ul className="divide-y">
                {groups.map((g) => (
                  <li key={g._id} className="flex items-center gap-3 px-3 py-2.5">
                    <GroupAvatar group={g} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{g.name}</div>
                      <div className="text-text-faint text-xs">Deleted by {g.deletedByName} {relativeTime(g.deletedAt)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await restoreGroup({ groupId: g._id });
                          toast.success("Group restored");
                          navigate(`/groups/${g._id}`);
                        } catch (e) {
                          toast.error(errorMessage(e));
                        }
                      }}
                    >
                      <Undo2 /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {expenses.length > 0 ? (
            <Section title="Expenses">
              <ul className="divide-y">
                {expenses.map((it) => (
                  <ExpenseRow
                    key={it._id}
                    item={it}
                    showGroup
                    trailing={
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            await restoreExpense({ id: it._id });
                            toast.success("Expense restored");
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      >
                        <Undo2 /> Restore
                      </Button>
                    }
                  />
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
      {!empty && groups.length === 0 && expenses.length === 0 ? <Users className="hidden" /> : null}
    </div>
  );
}
