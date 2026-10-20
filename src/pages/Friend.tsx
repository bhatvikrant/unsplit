import { useAction, useConvex, useMutation, useQuery, useRequireOnline } from "@/lib/convex";
import { Bell, Download, HandCoins, Plus, Receipt, RefreshCw, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserAvatar } from "@/components/common/Avatars";
import { ExpenseList } from "@/components/common/ExpenseList";
import { EmptyState, InfoHint, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { BalanceSummary } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { Button } from "@/components/ui/button";
import { downloadFile, errorMessage, formatDate, toCsv } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { usePagedExpenses } from "@/lib/usePagedExpenses";
import { NotFound } from "./NotFound";

export function FriendPage() {
  const { id } = useParams();
  const friendId = id as Id<"users">;
  const me = useMe();
  const friend = useQuery(api.friends.get, id ? { friendId } : "skip");
  const remind = useAction(api.friends.remind);
  const remove = useMutation(api.friends.remove);
  const confirm = useConfirm();
  const convex = useConvex();
  const requireOnline = useRequireOnline();
  const dialogs = useDialogs();
  const navigate = useNavigate();
  const { items, hasMore, loadMore, loadingMore } = usePagedExpenses({ friendId });
  const [failed, setFailed] = useState(false);
  const [reminding, setReminding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => friend === undefined && setFailed(true), 8000);
    return () => clearTimeout(t);
  }, [friend]);
  if (friend === undefined) return failed ? <NotFound /> : <RowSkeleton />;

  const theyOwe = Object.values(friend.total).some((v) => v > 0);
  const settled = Object.values(friend.total).every((v) => v === 0);
  const nonGroupOnly = friend.breakdown.every((b) => b.groupId === null);

  return (
    <div>
      <PageHeader
        leading={<UserAvatar user={friend.user} size="lg" />}
        title={friend.user.name}
        subtitle={friend.user.isPlaceholder ? "Hasn't joined UnSplit yet" : friend.user.email ?? `Friends since ${formatDate(friend.since)}`}
        actions={
          <>
            <Button onClick={() => dialogs.addExpense({ friendId })}>
              <Plus /> Add expense
            </Button>
            <Button variant="secondary" onClick={() => dialogs.settleUp(nonGroupOnly ? { friendId, payerId: theyOwe ? friendId : me?._id, payeeId: theyOwe ? me?._id : friendId } : { payerId: theyOwe ? friendId : me?._id, payeeId: theyOwe ? me?._id : friendId })}>
              <HandCoins /> Settle up
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <ExpenseList
            items={items}
            hasMore={hasMore}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            showGroup
            empty={<EmptyState icon={Receipt} title={`Nothing shared with ${friend.user.name} yet`} description="Expenses you share directly or in a group together show up here." action={<Button onClick={() => dialogs.addExpense({ friendId })}><Plus /> Add expense</Button>} />}
          />
        </div>
        <aside className="space-y-4">
          <Section title="Balance">
            <div className="px-3 py-2.5">
              <BalanceSummary balances={friend.total} subjectName={friend.user.name.split(" ")[0]} className="items-start text-sm" />
            </div>
            {friend.breakdown.length > 0 ? (
              <ul className="divide-y border-t">
                {friend.breakdown.map((b) => (
                  <li key={b.groupId ?? "none"} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    {b.groupId ? <Link to={`/groups/${b.groupId}`} className="truncate hover:underline">{b.groupName}</Link> : <span className="text-text-muted truncate">{b.groupName}</span>}
                    <BalanceSummary balances={b.balances} compact className="text-xs" />
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={!theyOwe || reminding}
                title={theyOwe ? undefined : "They don't owe you anything"}
                onClick={async () => {
                  setReminding(true);
                  try {
                    const r = await remind({ friendId });
                    if (r.sent) toast.success("Reminder sent");
                    else toast.error(r.reason ?? "Couldn't send");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setReminding(false);
                  }
                }}
              >
                <Bell /> Send a reminder
              </Button>
              <InfoHint text="Emails them what they owe you across every group and shared expense, with a link to settle up." />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={async () => {
                try {
                  requireOnline();
                  const { headers, rows } = await convex.query(api.exports.csv, { friendId });
                  downloadFile(`${friend.user.name.replace(/[^\w-]+/g, "_")}.csv`, toCsv(headers, rows), "text/csv");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <Download /> Export as spreadsheet
            </Button>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => dialogs.convertCurrency({ friendId })}>
              <RefreshCw /> Convert non-group expenses
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-text-muted justify-start"
              disabled={!settled}
              title={settled ? undefined : "Settle up first"}
              onClick={async () => {
                if (!(await confirm({ title: `Remove ${friend.user.name} from your friends?`, description: "Shared expenses are kept.", action: "Remove" }))) return;
                try {
                  await remove({ friendId });
                  navigate("/dashboard");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <UserMinus /> Remove friend
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
