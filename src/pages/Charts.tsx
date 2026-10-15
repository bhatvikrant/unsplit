import { useQuery } from "convex/react";
import { BarChart3 } from "lucide-react";
import { useParams } from "react-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { categoryBySlug, CATEGORY_GROUPS } from "@convex/lib/categories";
import { CategoryIcon, EmptyState, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { monthLabel } from "@/lib/format";
import { useFormatMoney } from "@/lib/hooks";
import { useState } from "react";
import { GroupNav } from "./Group";

/** Categorical palette, fixed order per parent category. Validated with the dataviz checks (light + dark). */
const GROUP_COLORS: Record<string, [string, string]> = {
  home: ["#4f46e5", "#6366f1"],
  transportation: ["#0d9488", "#0d9488"],
  food: ["#d97706", "#d97706"],
  entertainment: ["#db2777", "#db2777"],
  utilities: ["#2563eb", "#3b82f6"],
  life: ["#65a30d", "#65a30d"],
  general: ["#9333ea", "#9333ea"],
  uncategorized: ["#b45309", "#b45309"],
};

function colorFor(slug: string, dark: boolean) {
  const parent = categoryBySlug(slug).parent;
  return (GROUP_COLORS[parent] ?? GROUP_COLORS.uncategorized)[dark ? 1 : 0];
}

export function ChartsPage() {
  const { id } = useParams();
  const groupId = id ? (id as Id<"groups">) : undefined;
  const [mode, setMode] = useState<"mine" | "group">(groupId ? "group" : "mine");
  const [months, setMonths] = useState(6);
  const group = useQuery(api.groups.get, groupId ? { groupId } : "skip");
  const data = useQuery(api.insights.charts, { groupId, mode, months });
  const [currency, setCurrency] = useState<string | null>(null);
  const fmt = useFormatMoney();
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const currencies = data ? Object.keys(data.series).sort((a, b) => data.series[b].count - data.series[a].count) : [];
  const cur = currency && currencies.includes(currency) ? currency : currencies[0];
  const s = cur && data ? data.series[cur] : null;

  const byMonth = data && s ? data.monthKeys.map((k) => ({ key: k, label: monthLabel(k).slice(0, 3), value: s.byMonth[k] ?? 0 })) : [];
  const maxMonth = Math.max(1, ...byMonth.map((m) => m.value));
  const byCategory = s
    ? Object.entries(s.byCategory)
        .map(([slug, v]) => ({ slug, name: categoryBySlug(slug).name, parent: categoryBySlug(slug).parent, value: v }))
        .sort((a, b) => b.value - a.value)
    : [];
  const byParent = CATEGORY_GROUPS.map((g) => ({ slug: g.slug, name: g.name, value: byCategory.filter((c) => c.parent === g.slug).reduce((a, c) => a + c.value, 0) })).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
  const total = s?.total ?? 0;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={group ? `${group.name}: charts` : "Spending charts"}
        subtitle={mode === "mine" ? "Your share of expenses, by month and by category." : "Everything the group spent, by month and by category."}
        actions={
          <>
            {groupId ? (
              <Tabs value={mode} onValueChange={(v) => setMode(v as "mine" | "group")}>
                <TabsList>
                  <TabsTrigger value="group">Group</TabsTrigger>
                  <TabsTrigger value="mine">My share</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="w-32" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
            {currencies.length > 1 ? (
              <Select value={cur} onValueChange={setCurrency}>
                <SelectTrigger className="w-24" aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </>
        }
      />
      {groupId ? <GroupNav groupId={groupId} current="charts" /> : null}
      {data === undefined ? (
        <RowSkeleton />
      ) : !s ? (
        <EmptyState icon={BarChart3} title="Nothing to chart yet" description="Expenses in this period will show up here, by month and by category." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={`Total (${months} months)`} value={fmt(total, cur!)} />
            <Stat label="Per month" value={fmt(Math.round(total / months), cur!)} />
            <Stat label="Expenses" value={String(s.count)} />
          </div>

          <Section title="By month">
            <figure className="p-4">
              <div className="flex h-44 items-end gap-1.5" role="img" aria-label={`Spending by month in ${cur}`}>
                {byMonth.map((m) => (
                  <div key={m.key} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div className="bg-brand rounded-t-[4px] transition-[height] duration-300" style={{ height: `${Math.max(m.value > 0 ? 2 : 0, (m.value / maxMonth) * 100)}%` }} title={`${monthLabel(m.key)}: ${fmt(m.value, cur!)}`} />
                    <div className="bg-text text-bg pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">{fmt(m.value, cur!)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {byMonth.map((m) => (
                  <div key={m.key} className="text-text-faint flex-1 truncate text-center text-[11px]">{m.label}</div>
                ))}
              </div>
              <figcaption className="sr-only">
                {byMonth.map((m) => `${monthLabel(m.key)}: ${fmt(m.value, cur!)}`).join("; ")}
              </figcaption>
            </figure>
          </Section>

          <Section title="By category">
            <div className="p-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label="Share of spending by category group">
                {byParent.map((g, i) => (
                  <div key={g.slug} style={{ width: `${(g.value / total) * 100}%`, background: colorFor(g.slug, dark), marginLeft: i ? 2 : 0 }} title={`${g.name}: ${fmt(g.value, cur!)}`} />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {byParent.map((g) => (
                  <li key={g.slug} className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: colorFor(g.slug, dark) }} />
                    <span className="text-text-muted">{g.name}</span>
                    <span className="text-text font-medium">{Math.round((g.value / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <table className="w-full border-t text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byCategory.map((c) => (
                  <tr key={c.slug}>
                    <td className="flex items-center gap-2.5 px-4 py-2">
                      <CategoryIcon slug={c.slug} size="sm" />
                      <span>{c.name}</span>
                    </td>
                    <td className="tnum px-4 py-2 text-right">
                      <Money minor={c.value} currency={cur!} />
                    </td>
                    <td className="w-40 px-4 py-2">
                      <div className="bg-surface-2 h-1.5 w-full overflow-hidden rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${(c.value / total) * 100}%`, background: colorFor(c.slug, dark) }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-text-muted text-xs font-medium">{label}</div>
      <div className="tnum mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
