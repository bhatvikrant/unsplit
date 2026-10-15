import { Plus, Trash2 } from "lucide-react";
import { minorToDecimalString } from "@convex/lib/money";
import { SPLIT_METHODS, type SplitMethod } from "@convex/lib/split";
import { UserAvatar } from "@/components/common/Avatars";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { newItem, type SplitState } from "./splitState";

type Person = { _id: string; name: string; image?: string | null };

const LABELS: Record<SplitMethod, string> = {
  equal: "Equally",
  exact: "Exact amounts",
  percent: "Percentages",
  shares: "Shares",
  adjustment: "Adjustment",
  reimbursement: "Reimbursement",
  itemized: "Itemized",
};

const HELP: Record<SplitMethod, string> = {
  equal: "Everyone ticked pays the same.",
  exact: "Type what each person owes. Must add up to the total.",
  percent: "Give each person a percentage. Must add up to 100%.",
  shares: "Give each person a number of shares. 2 shares pays twice as much as 1.",
  adjustment: "Add an extra amount for some people; the rest is split equally.",
  reimbursement: "The payer got money back and passes it on. Enter who gets how much.",
  itemized: "List each item and who had it. Tax and tip are split in proportion.",
};

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

  const amountInput = (value: string, onValue: (v: string) => void, label: string, suffix?: string) => (
    <div className="relative w-28">
      <Input inputMode="decimal" aria-label={label} value={value} onChange={(e) => onValue(e.target.value)} className={cn("tnum text-right", suffix && "pr-7")} placeholder="0" />
      {suffix ? <span className="text-text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm">{suffix}</span> : null}
    </div>
  );

  const sumOf = (rec: Record<string, string>) => Object.values(rec).reduce((a, v) => a + (v.trim() === "" ? 0 : Number(v) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="bg-surface-2 flex flex-wrap gap-0.5 rounded-[10px] p-[3px]" role="tablist" aria-label="Split method">
        {SPLIT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={state.method === m}
            onClick={() => set({ method: m, items: m === "itemized" && state.items.length === 0 ? [newItem(ids)] : state.items })}
            className={cn("pressable rounded-lg px-2.5 py-1 text-xs font-medium", state.method === m ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--line)]" : "text-text-muted hover:text-text")}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-text-muted text-xs">{HELP[state.method]}</p>

      {state.method !== "itemized" ? (
        <ul className="shadow-ring divide-y overflow-hidden rounded-xl">
          {people.map((p) => {
            const checked = state.method === "equal" || state.method === "adjustment" ? state.selected[p._id] !== false : undefined;
            return (
              <li key={p._id} className="flex items-center gap-3 px-3 py-2">
                {checked !== undefined ? (
                  <Checkbox checked={checked} aria-label={`Include ${p.name}`} onCheckedChange={(v) => set({ selected: { ...state.selected, [p._id]: Boolean(v) } })} />
                ) : null}
                <UserAvatar user={p} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {state.method === "exact" && amountInput(state.exact[p._id] ?? "", (v) => set({ exact: { ...state.exact, [p._id]: v } }), `${p.name} amount`)}
                {state.method === "percent" && amountInput(state.percent[p._id] ?? "", (v) => set({ percent: { ...state.percent, [p._id]: v } }), `${p.name} percent`, "%")}
                {state.method === "shares" && amountInput(state.shares[p._id] ?? "", (v) => set({ shares: { ...state.shares, [p._id]: v } }), `${p.name} shares`, "sh")}
                {state.method === "adjustment" && checked && amountInput(state.adjustments[p._id] ?? "", (v) => set({ adjustments: { ...state.adjustments, [p._id]: v } }), `${p.name} extra`, "+")}
                {state.method === "reimbursement" && amountInput(state.reimbursement[p._id] ?? "", (v) => set({ reimbursement: { ...state.reimbursement, [p._id]: v } }), `${p.name} gets back`)}
                {owed && (state.method === "equal" || state.method === "adjustment" || state.method === "shares" || state.method === "percent") ? (
                  <span className="text-text-muted tnum w-20 text-right text-xs">{owed[p._id] !== undefined ? <Money minor={owed[p._id]} currency={currency} /> : "—"}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-2">
          {state.items.map((it, idx) => (
            <div key={it.id} className="shadow-ring rounded-xl p-2.5">
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
            <ul className="shadow-ring divide-y overflow-hidden rounded-xl text-sm">
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

      <div className="text-text-muted flex items-center justify-between text-xs">
        <span>
          {state.method === "percent" ? `${sumOf(state.percent).toFixed(2)}% of 100%` : null}
          {state.method === "shares" ? `${sumOf(state.shares)} shares` : null}
          {state.method === "exact" && totalMinor !== null ? <>Entered: <Money minor={Object.values(state.exact).reduce((a, v) => a + (parseMoneySafe(v, currency) ?? 0), 0)} currency={currency} /> of <Money minor={totalMinor} currency={currency} /></> : null}
          {state.method === "reimbursement" && payerNames ? `${payerNames} received the refund` : null}
        </span>
        {preview && "error" in preview ? <span className="text-danger">{preview.error}</span> : null}
      </div>
    </div>
  );
}

function parseMoneySafe(v: string, currency: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Reuse the exact minor conversion for display consistency.
  const str = minorToDecimalString(0, currency);
  void str;
  const decimals = (minorToDecimalString(1, currency).split(".")[1] ?? "").length;
  return Math.round(n * 10 ** decimals);
}
