import { useQuery } from "@/lib/convex";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ExpenseListItem } from "@/components/common/ExpenseList";
import { useLastDefined } from "@/lib/hooks";

type Args = { groupId?: Id<"groups">; friendId?: Id<"users">; search?: string; includeDeleted?: boolean };

/**
 * First page is a live subscription (new expenses appear instantly). Extra
 * pages are fetched by date cursor and appended. While the arguments change
 * (a new search) the previous list stays up instead of a skeleton.
 */
export function usePagedExpenses(args: Args, pageSize = 50) {
  const key = JSON.stringify(args);
  const first = useQuery(api.expenses.list, { ...args, limit: pageSize });
  // Cursors belong to one set of arguments; a new key starts from the first page again.
  const [paging, setPaging] = useState<{ key: string; cursors: number[] }>({ key, cursors: [] });
  const extraCursor = paging.key === key ? paging.cursors : [];
  const pages = [first];
  // Hooks can't be called in a loop with variable count, so cap at 8 extra pages.
  const extras = [
    useQuery(api.expenses.list, extraCursor[0] !== undefined ? { ...args, limit: pageSize, before: extraCursor[0] } : "skip"),
    useQuery(api.expenses.list, extraCursor[1] !== undefined ? { ...args, limit: pageSize, before: extraCursor[1] } : "skip"),
    useQuery(api.expenses.list, extraCursor[2] !== undefined ? { ...args, limit: pageSize, before: extraCursor[2] } : "skip"),
    useQuery(api.expenses.list, extraCursor[3] !== undefined ? { ...args, limit: pageSize, before: extraCursor[3] } : "skip"),
    useQuery(api.expenses.list, extraCursor[4] !== undefined ? { ...args, limit: pageSize, before: extraCursor[4] } : "skip"),
    useQuery(api.expenses.list, extraCursor[5] !== undefined ? { ...args, limit: pageSize, before: extraCursor[5] } : "skip"),
    useQuery(api.expenses.list, extraCursor[6] !== undefined ? { ...args, limit: pageSize, before: extraCursor[6] } : "skip"),
    useQuery(api.expenses.list, extraCursor[7] !== undefined ? { ...args, limit: pageSize, before: extraCursor[7] } : "skip"),
  ];
  pages.push(...extras.slice(0, extraCursor.length));

  const items = useMemo(() => {
    if (!first) return undefined;
    const seen = new Set<string>();
    const out: ExpenseListItem[] = [];
    for (const p of pages) {
      if (!p) continue;
      for (const it of p.items) {
        if (seen.has(it._id)) continue;
        seen.add(it._id);
        out.push(it as ExpenseListItem);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, ...extras]);

  const lastPage = pages[pages.length - 1];
  const hasMore = Boolean(lastPage && lastPage.nextBefore !== null) && extraCursor.length < 8;
  const loadingMore = extraCursor.length > 0 && lastPage === undefined;
  const loadMore = () => {
    const next = lastPage?.nextBefore;
    if (next && !extraCursor.includes(next)) setPaging({ key, cursors: [...extraCursor, next] });
  };
  return { items: useLastDefined(items), hasMore, loadMore, loadingMore };
}
