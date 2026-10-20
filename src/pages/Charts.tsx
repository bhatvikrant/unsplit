import { useQuery } from "@/lib/convex";
import { useReducedMotion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { categoryBySlug, CATEGORY_GROUPS } from "@convex/lib/categories";
import { currencyDecimals } from "@convex/lib/money";
import { CategoryIcon, EmptyState, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { Money } from "@/components/common/Money";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { monthLabel } from "@/lib/format";
import { useFormatMoney } from "@/lib/hooks";
import { GroupNav } from "./Group";

/** The theme's five chart hues (src/index.css, light and dark), cycled when there are more groups. */
const HUES = 5;
const hue = (i: number) => `var(--chart-${(i % HUES) + 1})`;

const monthConfig = { amount: { label: "Spent", color: "var(--chart-1)" } } satisfies ChartConfig;
const pieConfig = { amount: { label: "Amount" } } satisfies ChartConfig;

/** Tooltip row: colour swatch, name, amount, optional share. */
function Row({ color, name, value, hint }: { color?: string; name?: string; value: string; hint?: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="text-muted-foreground">{name}</span>
      {hint ? <span className="text-muted-foreground">· {hint}</span> : null}
      <span className="tnum text-foreground ml-auto pl-3 font-medium">{value}</span>
    </div>
  );
}

function MonthBars({ data, currency }: { data: { key: string; label: string; value: number }[]; currency: string }) {
  const fmt = useFormatMoney();
  const reduce = useReducedMotion();
  const decimals = currencyDecimals(currency);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const rows = data.map((d) => ({ ...d, amount: d.value / 10 ** decimals }));
  return (
    <ChartContainer config={monthConfig} className="h-52 w-full">
      <BarChart accessibilityLayer data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => compact.format(v)} />
        <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(_l, items) => monthLabel(String(items?.[0]?.payload?.key ?? ""))} formatter={(_v, _n, item) => <Row color="var(--color-amount)" name="Spent" value={fmt(item.payload?.value ?? 0, currency)} />} />} />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[5, 5, 0, 0]} maxBarSize={36} isAnimationActive={!reduce} />
      </BarChart>
    </ChartContainer>
  );
}

function GroupDonut({ data, total, currency }: { data: { slug: string; name: string; value: number }[]; total: number; currency: string }) {
  const fmt = useFormatMoney();
  const reduce = useReducedMotion();
  return (
    <ChartContainer config={pieConfig} className="mx-auto aspect-square h-52 w-full max-w-52">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(_v, _n, item) => <Row color={item.payload?.fill} name={item.payload?.name} value={fmt(item.payload?.value ?? 0, currency)} hint={`${Math.round(((item.payload?.value ?? 0) / total) * 100)}%`} />} />} />
        {/* 12 o'clock, clockwise: the same order as the legend */}
        <Pie data={data} dataKey="value" nameKey="name" startAngle={90} endAngle={-270} innerRadius={58} outerRadius={82} paddingAngle={data.length > 1 ? 2 : 0} cornerRadius={3} minAngle={3} strokeWidth={0} isAnimationActive={!reduce}>
          {data.map((d, i) => (
            <Cell key={d.slug} fill={hue(i)} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              const cx = Number(viewBox.cx);
              const cy = Number(viewBox.cy);
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={cx} y={cy - 9} className="fill-muted-foreground text-[11px]">Total</tspan>
                  <tspan x={cx} y={cy + 11} className="fill-foreground text-[15px] font-semibold">{fmt(total, currency)}</tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
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

  const currencies = data ? Object.keys(data.series).sort((a, b) => data.series[b].count - data.series[a].count) : [];
  const cur = currency && currencies.includes(currency) ? currency : currencies[0];
  const s = cur && data ? data.series[cur] : null;

  const byMonth = data && s ? data.monthKeys.map((k) => ({ key: k, label: monthLabel(k).slice(0, 3), value: s.byMonth[k] ?? 0 })) : [];
  const byCategory = s
    ? Object.entries(s.byCategory)
        .map(([slug, v]) => ({ slug, name: categoryBySlug(slug).name, parent: categoryBySlug(slug).parent, value: v }))
        .sort((a, b) => b.value - a.value)
    : [];
  const byParent = CATEGORY_GROUPS.map((g) => ({ slug: g.slug, name: g.name, value: byCategory.filter((c) => c.parent === g.slug).reduce((a, c) => a + c.value, 0) })).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
  // a category takes its parent group's hue, so the table matches the donut
  const parentHue = new Map(byParent.map((g, i) => [g.slug, hue(i)]));
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
            <figure className="p-4 pl-2">
              <MonthBars data={byMonth} currency={cur!} />
              <figcaption className="sr-only">{byMonth.map((m) => `${monthLabel(m.key)}: ${fmt(m.value, cur!)}`).join("; ")}</figcaption>
            </figure>
          </Section>

          <Section title="By category">
            <div className="grid items-center gap-4 p-4 sm:grid-cols-[auto_1fr]">
              <GroupDonut data={byParent} total={total} currency={cur!} />
              <ul className="space-y-1.5 text-sm" aria-label="Share of spending by category group">
                {byParent.map((g) => (
                  <li key={g.slug} className="flex items-center gap-2.5">
                    <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: parentHue.get(g.slug) }} />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <Money minor={g.value} currency={cur!} className="text-text-muted" />
                    <span className="tnum w-10 text-right font-medium">{Math.round((g.value / total) * 100)}%</span>
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
                        <div className="h-full rounded-full" style={{ width: `${(c.value / total) * 100}%`, background: parentHue.get(c.parent) }} />
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
