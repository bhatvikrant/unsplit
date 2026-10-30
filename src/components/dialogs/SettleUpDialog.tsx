import { useMutation, useQuery } from "@/lib/convex";
import { ArrowRight } from "lucide-react";
import { useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { minorToDecimalString, parseMoney } from "@convex/lib/money";
import { UserAvatar } from "@/components/common/Avatars";
import { Field } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Picker, PickerItem } from "@/components/ui/picker";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useDefaultCurrency, useMe } from "@/lib/hooks";
import { CurrencyPicker } from "./pickers";

/**
 * Everything is optional; whatever is left out is filled in from the balances so the dialog opens
 * ready to record. `friendId` names the person to settle with, not a scope: the payment lands in
 * whichever group (or their non-group expenses) holds the biggest balance with them. With nothing
 * given at all, it starts with the friend you have the biggest balance with.
 */
export type SettleUpOptions = { groupId?: Id<"groups">; friendId?: Id<"users">; payerId?: Id<"users">; payeeId?: Id<"users">; amountMinor?: number; currency?: string };

export function SettleUpDialog({ options, onClose }: { options: SettleUpOptions; onClose: () => void }) {
  const me = useMe();
  const defaultCurrency = useDefaultCurrency();
  const groups = useQuery(api.groups.list);
  const friendsList = useQuery(api.friends.list);
  const record = useMutation(api.expenses.recordPayment);

  const [scope, setScope] = useState<string>(options.groupId ? `group:${options.groupId}` : "");
  const [kind, scopeId] = scope.split(":");
  const group = useQuery(api.groups.get, kind === "group" ? { groupId: scopeId as Id<"groups"> } : "skip");
  const friend = useQuery(api.friends.get, kind === "friend" ? { friendId: scopeId as Id<"users"> } : "skip");

  // The person this payment is with: named by the caller, or the other side of a named payer and
  // recipient, or else the friend with the biggest balance (amounts compared across currencies as is).
  const counterpartId = useMemo(() => {
    if (options.friendId) return options.friendId;
    const named = [options.payerId, options.payeeId].find((id) => id && id !== me?._id);
    if (named) return named;
    let best: Id<"users"> | undefined;
    let bestAbs = 0;
    for (const f of friendsList ?? [])
      for (const v of Object.values(f.balances))
        if (Math.abs(v) > bestAbs) [best, bestAbs] = [f.user._id, Math.abs(v)];
    return best;
  }, [options.friendId, options.payerId, options.payeeId, me, friendsList]);
  const counterpart = useQuery(api.friends.get, !scope && counterpartId ? { friendId: counterpartId } : "skip");

  // No group given: settle where the balance with that person is, in the direction asked for if a
  // payer and recipient were named. Nothing owed anywhere: their non-group expenses.
  useLayoutEffect(() => {
    if (scope || !me || !counterpart || counterpart.user._id !== counterpartId) return;
    const sign = options.payerId === me._id ? -1 : options.payeeId === me._id ? 1 : 0;
    let best: Id<"groups"> | null | undefined;
    let bestAbs = 0;
    for (const b of counterpart.breakdown)
      for (const v of Object.values(b.balances))
        if (v !== 0 && (sign === 0 || Math.sign(v) === sign) && Math.abs(v) > bestAbs) [best, bestAbs] = [b.groupId, Math.abs(v)];
    setScope(best ? `group:${best}` : `friend:${counterpartId}`);
  }, [scope, me, counterpart, counterpartId, options.payerId, options.payeeId]);

  const people = useMemo(() => {
    if (kind === "group" && group) return group.members;
    if (kind === "friend" && friend && me) return [me, friend.user];
    return [];
  }, [kind, group, friend, me]);

  const [payerId, setPayerId] = useState<string>(options.payerId ?? "");
  const [payeeId, setPayeeId] = useState<string>(options.payeeId ?? "");
  const [currency, setCurrency] = useState(options.currency ?? defaultCurrency);
  const [amount, setAmount] = useState(options.amountMinor ? minorToDecimalString(options.amountMinor, options.currency ?? defaultCurrency) : "");
  const [amountTouched, setAmountTouched] = useState(Boolean(options.amountMinor));
  const [date, setDate] = useState(() => Date.now());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-group balances with the friend in a friend scope; positive = they owe me.
  const pairBalances = useMemo(() => (kind === "friend" && friend ? friend.breakdown.find((b) => b.groupId === null)?.balances ?? {} : {}), [kind, friend]);

  // Defaults fill in before paint, so the selects never show their placeholders for a frame. Kept
  // when both people are in this scope; otherwise the biggest debt involving me (with the
  // counterpart first), else any debt in the group, else me paying the counterpart.
  useLayoutEffect(() => {
    if (!me || people.length === 0) return;
    const inScope = (id: string) => people.some((p) => p._id === id);
    if (inScope(payerId) && inScope(payeeId) && payerId !== payeeId) return;
    let pair: [string, string] | undefined;
    if (kind === "group" && group) {
      const debts = [...group.debts].sort((a, b) => b.amountMinor - a.amountMinor);
      const mine = debts.filter((d) => d.from === me._id || d.to === me._id);
      const d = mine.find((d) => d.from === counterpartId || d.to === counterpartId) ?? mine[0] ?? debts[0];
      if (d) pair = [d.from, d.to];
    } else if (kind === "friend" && friend) {
      const v = Object.values(pairBalances).find((v) => v !== 0) ?? 0;
      pair = v > 0 ? [friend.user._id, me._id] : [me._id, friend.user._id];
    }
    if (!pair) {
      const other = people.find((p) => p._id === counterpartId) ?? people.find((p) => p._id !== me._id);
      if (!other) return;
      pair = [me._id, other._id];
    }
    setPayerId(pair[0]);
    setPayeeId(pair[1]);
  }, [me, people, payerId, payeeId, kind, group, friend, pairBalances, counterpartId]);

  // Suggested amount: what payer owes payee in this scope, in the chosen currency.
  const owedByPayer = useMemo(() => {
    const out: Record<string, number> = {};
    if (!payerId || !payeeId) return out;
    if (kind === "group" && group) {
      for (const d of group.debts) if (d.from === payerId && d.to === payeeId) out[d.currency] = (out[d.currency] ?? 0) + d.amountMinor;
    } else if (kind === "friend" && friend && me) {
      // Only the non-group balance: a payment here never touches what's owed inside a group.
      for (const [cur, v] of Object.entries(pairBalances)) {
        if (payerId === me._id && payeeId === friend.user._id && v < 0) out[cur] = -v;
        if (payerId === friend.user._id && payeeId === me._id && v > 0) out[cur] = v;
      }
    }
    return out;
  }, [kind, group, friend, me, payerId, payeeId, pairBalances]);

  useLayoutEffect(() => {
    if (amountTouched) return;
    const currencies = Object.keys(owedByPayer);
    if (currencies.length === 0) return setAmount("");
    const cur = currencies.includes(currency) ? currency : currencies[0];
    setCurrency(cur);
    setAmount(minorToDecimalString(owedByPayer[cur], cur));
  }, [owedByPayer, amountTouched, currency]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const minor = parseMoney(amount, currency);
    if (minor === null || minor <= 0) return setError("Enter an amount greater than zero");
    if (!payerId || !payeeId) return setError("Pick who paid whom");
    setBusy(true);
    try {
      await record({
        groupId: kind === "group" ? (scopeId as Id<"groups">) : undefined,
        friendId: kind === "friend" ? (scopeId as Id<"users">) : undefined,
        payerId: payerId as Id<"users">,
        payeeId: payeeId as Id<"users">,
        amountMinor: minor,
        currency,
        date,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Picking the person already on the other side swaps the two, so payer and recipient can never
  // end up the same person (which left Record disabled with no way forward).
  const pickPayer = (v: string) => {
    if (v === payeeId) setPayeeId(payerId);
    setPayerId(v);
    setAmountTouched(false);
  };
  const pickPayee = (v: string) => {
    if (v === payerId) setPayerId(payeeId);
    setPayeeId(v);
    setAmountTouched(false);
  };

  const personSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <Picker value={value} onValueChange={onChange} aria-label={label} placeholder={label} className="w-full">
      {people.map((p) => (
        <PickerItem key={p._id} value={p._id} icon={<UserAvatar user={p} size="xs" />}>
          {p._id === me?._id ? "You" : p.name}
        </PickerItem>
      ))}
    </Picker>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" size="full" action={{ label: busy ? "Saving…" : "Record", type: "submit", disabled: busy || !scope || !payerId || !payeeId || payerId === payeeId }}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Settle up</DialogTitle>
            <DialogDescription>Record a payment that happened in cash, by bank transfer, or any other way.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <Field label="Where" htmlFor="scope">
              <Picker value={scope} onValueChange={(v) => { setScope(v); setPayerId(""); setPayeeId(""); setAmountTouched(false); }} id="scope" placeholder="Group or friend" title="Where" className="w-full">
                {groups?.map((g) => (
                  <PickerItem key={g._id} value={`group:${g._id}`}>
                    {g.name}
                  </PickerItem>
                ))}
                {friendsList?.map((f) => (
                  <PickerItem key={f.user._id} value={`friend:${f.user._id}`}>
                    {f.user.name} (no group)
                  </PickerItem>
                ))}
              </Picker>
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <Field label="Payer">{personSelect(payerId, pickPayer, "Payer")}</Field>
              <ArrowRight className="text-text-faint mb-2.5 size-4" />
              <Field label="Recipient">{personSelect(payeeId, pickPayee, "Recipient")}</Field>
            </div>
            <Field label="Amount" htmlFor="amount" error={error} hint={Object.keys(owedByPayer).length > 1 ? "There are balances in more than one currency. Record one payment per currency." : undefined}>
              <div className="flex gap-2">
                <CurrencyPicker value={currency} compact onChange={(c) => { setCurrency(c); setAmountTouched(true); }} />
                <Input id="amount" inputMode="decimal" required className="tnum text-lg font-semibold max-sm:h-11" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} />
              </div>
            </Field>
            <Field label="Date" htmlFor="pdate">
              <Input id="pdate" type="date" className="max-sm:h-11" value={toDateInputValue(date)} onChange={(e) => e.target.value && setDate(fromDateInputValue(e.target.value, date))} />
            </Field>
            <Field label="Note" htmlFor="pnotes">
              <Textarea id="pnotes" rows={2} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !scope || !payerId || !payeeId || payerId === payeeId}>
              {busy ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
