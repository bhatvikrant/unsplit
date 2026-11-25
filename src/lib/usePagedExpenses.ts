import { useQueries } from "@/lib/convex";
import { useEffect, useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ExpenseListItem } from "@/components/common/ExpenseList";
import { useLastDefined } from "@/lib/hooks";

type Args = { groupId?: Id<"groups">; friendId?: Id<"users">; search?: string; includeDeleted?: boolean };

/**
 * Convex pagination over `expenses.list`: every loaded page is a live subscription through the
 * offline layer, so queued changes show on any page and new expenses land in the first, and the
 * server keeps pages adjacent as rows come and go. While the arguments change (a new search) the
 * previous list stays up instead of a skeleton.
 */
export function usePagedExpenses(args: Args, pageSize = 50) {
  const key = JSON.stringify(args);
  // Cursors belong to one set of arguments; a new key starts from the first page again.
  const [paging, setPaging] = useState<{ key: string; cursors: string[] }>({ key, cursors: [] });
  const cursors = paging.key === key ? paging.cursors : [];
  // shortcut: a search reads 500 rows a page so a rare term doesn't take dozens of round trips; add a search index if lists grow past a few thousand rows.
  const numItems = args.search ? 500 : pageSize;
  // Every page but the last is pinned to the range it had when the next one was loaded
  // (`endCursor`, as Convex's own usePaginatedQuery does); otherwise a new expense pushing page
  // 1's last row past `numItems` would drop that row into no page at all until a reload.
  const pages = useQueries(
    api.expenses.list,
    [null, ...cursors].map((cursor, i) => ({ ...args, paginationOpts: { numItems, cursor, endCursor: cursors[i] } })),
  );
  const last = pages[pages.length - 1];
  const next = last && !last.isDone ? last.continueCursor : null;
  const hasMore = next !== null;
  const loadingMore = cursors.length > 0 && last === undefined;

  const items = useMemo(() => {
    if (!pages[0]) return undefined;
    const seen = new Set<string>();
    const out: ExpenseListItem[] = [];
    for (const p of pages) {
      for (const it of p?.page ?? []) {
        if (seen.has(it._id)) continue;
        seen.add(it._id);
        out.push(it as ExpenseListItem);
      }
    }
    // Nothing kept yet with more to read is still loading, not empty.
    return out.length === 0 && hasMore ? undefined : out;
  }, [pages, hasMore]);

  const loadMore = () => {
    if (next && !cursors.includes(next)) setPaging({ key, cursors: [...cursors, next] });
  };
  // The list's filters run after a page is read, so a page can come back empty (a rare search
  // term, a friend's group expenses); keep reading until a row or the end turns up.
  useEffect(() => {
    if (hasMore && items === undefined) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, items]);
  return { items: useLastDefined(items), hasMore, loadMore, loadingMore };
}
