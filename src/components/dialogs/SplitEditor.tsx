import { Check, Equal, Percent, PieChart, Plus, ReceiptText, SlidersHorizontal, Split, Trash2, Undo2 } from "lucide-react";
import { currencySymbol } from "@convex/lib/currencies";
import { minorToDecimalString } from "@convex/lib/money";
import type { SplitMethod } from "@convex/lib/split";
import { UserAvatar } from "@/components/common/Avatars";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RowPicker, type RowOption } from "./FormRows";
import { editExact, newItem, resolveExact, switchMethod, type SplitState } from "./splitState";

type Person = { _id: string; name: string; image?: string | null };

const SPLIT_LABELS: Record<SplitMethod, string> = {
  equal: "Equally",
  exact: "Exact amounts",
  percent: "Percentages",
  shares: "Shares",
  adjustment: "Adjustment",
  reimbursement: "Money back",
  itemized: "Itemized",
};

const HELP: Record<SplitMethod, string> = {
  equal: "Everyone ticked pays the same",
  exact: "Type what each person owes",
  percent: "Each person pays a share of 100%",
  shares: "2 shares pays twice as much as 1",
  adjustment: "Equal, plus extra for some people",
  reimbursement: "A refund the payer passes on to others",
  itemized: "Who had what, from the bill",
};

function methodIcon(m: SplitMethod, currency: string) {
  switch (m) {
    case "equal": return <Equal />;
    case "exact": return <span className="text-[15px] leading-none font-semibold">{currencySymbol(currency)}</span>;
    case "percent": return <Percent />;
    case "shares": return <PieChart />;
    case "adjustment": return <SlidersHorizontal />;
    case "itemized": return <ReceiptText />;
    case "reimbursement": return <Undo2 />;
  }
}

/** The "Split" row: shows the method, opens a sheet (phones) or popover listing each one with a line on what it does. */
const METHOD_ORDER: SplitMethod[] = ["equal", "exact", "percent", "shares", "adjustment", "itemized", "reimbursement"];

export function SplitMethodRow({ state, onChange, ids, currency, methods = METHOD_ORDER }: { state: SplitState; onChange: (s: SplitState) => void; ids: string[]; currency: string; methods?: SplitMethod[] }) {
  const options: RowOption[] = methods.map((m) => ({
    value: m,
    label: SPLIT_LABELS[m],
    description: HELP[m],
    icon: (
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-[18px]", state.method === m ? "bg-brand text-on-brand" : "bg-surface-2 text-text-muted")}>
        {methodIcon(m, currency)}
      </span>
    ),
  }));
  return (
    <RowPicker
      icon={<Split />}
      label="Split"
      value={state.method}
      title="How to split"
      aria-label={`Split: ${SPLIT_LABELS[state.method]}`}
      options={options}
      strong
      onValueChange={(m) => onChange(switchMethod(state, m as SplitMethod, ids))}
    />
  );
}

export function SplitEditor({
  state,
  onChange,
  people,
  currency,
  totalMinor,
  preview,
  payerNames,
}: {
  state: SplitState;
  onChange: (s: SplitState) => void;
  people: Person[];
  currency: string;
  totalMinor: number | null;
  /** owed per person from the engine, or an error string */
  preview: { owed: Record<string, number> } | { error: string } | null;
  payerNames?: string;
}) {
  const set = (patch: Partial<SplitState>) => onChange({ ...state, ...patch });
  const ids = people.map((p) => p._id);
  const owed = preview && "owed" in preview ? preview.owed : null;
  const exact = state.method === "exact" ? resolveExact(state, ids, totalMinor, currency) : null;

  const amountInput = (value: string, onValue: (v: string) => void, label: string, suffix?: string, auto?: string) => (
    <div className="relative w-28">
      <Input
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className={cn("tnum text-right", suffix && "pr-7", auto !== undefined && "placeholder:text-text-muted")}
        placeholder={auto ?? "0"}
      />
      {suffix ? <span className="text-text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm">{suffix}</span> : null}
    </div>
  );

  const sumOf = (rec: Record<string, string>) => Object.values(rec).reduce((a, v) => a + (v.trim() === "" ? 0 : Number(v) || 0), 0);

  return (
    <div className="space-y-2">
      {state.method !== "itemized" ? (
        <ul className="bg-surface shadow-ring overflow-hidden rounded-2xl" aria-label="People in the split">
          {people.map((p) => {
            const checked = state.method === "equal" || state.method === "adjustment" ? state.selected[p._id] !== false : undefined;
            return (
              <li key={p._id} className="flex items-center gap-3 pl-3.5 [&:not(:last-child)>div]:border-b">
                {checked !== undefined ? (
                  <Checkbox checked={checked} aria-label={`Include ${p.name}`} onCheckedChange={(v) => set({ selected: { ...state.selected, [p._id]: Boolean(v) } })} />
                ) : null}
                <UserAvatar user={p} size="sm" className={cn(checked === false && "opacity-40")} />
                <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-3">
                  <span className={cn("min-w-0 flex-1", checked === false && "text-text-faint")}>
                    <span className="block truncate text-[15px] sm:text-sm">{p.name}</span>
                    {exact && exact.auto[p._id] !== undefined && !(p._id in exact.fixed) ? <span className="text-text-faint block text-xs">Splits the rest</span> : null}
                  </span>
                  {exact && (p._id in exact.fixed
                    ? amountInput(state.exact[p._id] ?? "", (v) => onChange(editExact(state, p._id, v, ids)), `${p.name} amount`)
                    : amountInput("", (v) => onChange(editExact(state, p._id, v, ids)), `${p.name} amount`, undefined, exact.auto[p._id] !== undefined ? minorToDecimalString(exact.auto[p._id], currency) : undefined))}
                  {state.method === "percent" && amountInput(state.percent[p._id] ?? "", (v) => set({ percent: { ...state.percent, [p._id]: v } }), `${p.name} percent`, "%")}
                  {state.method === "shares" && amountInput(state.shares[p._id] ?? "", (v) => set({ shares: { ...state.shares, [p._id]: v } }), `${p.name} shares`, "sh")}
                  {state.method === "adjustment" && checked && amountInput(state.adjustments[p._id] ?? "", (v) => set({ adjustments: { ...state.adjustments, [p._id]: v } }), `${p.name} extra`, "+")}
                  {state.method === "reimbursement" && amountInput(state.reimbursement[p._id] ?? "", (v) => set({ reimbursement: { ...state.reimbursement, [p._id]: v } }), `${p.name} gets back`)}
                  {owed && (state.method === "equal" || state.method === "adjustment" || state.method === "shares" || state.method === "percent") ? (
                    <span className={cn("tnum w-20 shrink-0 text-right", state.method === "equal" ? "text-text text-[15px] sm:text-sm" : "text-text-muted text-xs")}>{owed[p._id] !== undefined ? <Money minor={owed[p._id]} currency={currency} /> : "—"}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-2">
          {state.items.map((it, idx) => (
            <div key={it.id} className="bg-surface shadow-ring rounded-2xl p-2.5">
              <div className="flex items-center gap-2">
                <Input aria-label={`Item ${idx + 1} name`} placeholder="Item" value={it.name} onChange={(e) => set({ items: state.items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)) })} />
                {amountInput(it.amount, (v) => set({ items: state.items.map((x) => (x.id === it.id ? { ...x, amount: v } : x)) }), `Item ${idx + 1} price`)}
                <Button type="button" variant="ghost" size="icon" aria-label="Remove item" onClick={() => set({ items: state.items.filter((x) => x.id !== it.id) })}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {people.map((p) => {
                  const on = it.assignees[p._id] !== false;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ items: state.items.map((x) => (x.id === it.id ? { ...x, assignees: { ...x.assignees, [p._id]: !on } } : x)) })}
                      className={cn("flex items-center gap-1.5 shadow-ring rounded-full py-0.5 pr-2.5 pl-0.5 text-xs transition-colors", on ? "bg-brand-soft text-brand-ink shadow-[0_0_0_1px_var(--brand)]" : "text-text-faint")}
                    >
                      <UserAvatar user={p} size="xs" className="size-5 text-[9px]" />
                      {p.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set({ items: [...state.items, newItem(ids)] })}>
            <Plus /> Add item
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              <span className="text-text-muted mb-1 block">Tax</span>
              <Input inputMode="decimal" className="tnum" value={state.tax} onChange={(e) => set({ tax: e.target.value })} placeholder="0" />
            </label>
            <label className="text-xs">
              <span className="text-text-muted mb-1 block">Tip</span>
              <Input inputMode="decimal" className="tnum" value={state.tip} onChange={(e) => set({ tip: e.target.value })} placeholder="0" />
            </label>
            <label className="text-xs">
              <span className="text-text-muted mb-1 block">Discount</span>
              <Input inputMode="decimal" className="tnum" value={state.discount} onChange={(e) => set({ discount: e.target.value })} placeholder="0" />
            </label>
          </div>
          {owed ? (
            <ul className="bg-surface shadow-ring divide-y overflow-hidden rounded-2xl text-sm">
              {people.filter((p) => owed[p._id] !== undefined).map((p) => (
                <li key={p._id} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-text-muted">{p.name}</span>
                  <Money minor={owed[p._id]} currency={currency} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="text-text-muted flex items-start justify-between gap-3 px-3.5 text-xs empty:hidden [&>span:empty]:hidden">
        <span className="flex items-center gap-1">
          {state.method === "percent" ? `${sumOf(state.percent).toFixed(2)}% of 100%` : null}
          {state.method === "shares" ? `${sumOf(state.shares)} shares` : null}
          {exact && totalMinor !== null && exact.leftMinor !== null && exact.leftMinor >= 0 && !(preview && "error" in preview) ? (
            <>
              <Check className="text-brand size-3.5" /> Adds up to <Money minor={totalMinor} currency={currency} />
            </>
          ) : null}
          {state.method === "reimbursement" && payerNames ? `${payerNames} received the refund` : null}
        </span>
        {preview && "error" in preview ? <span className="text-danger text-right">{preview.error}</span> : null}
      </div>
    </div>
  );
}

