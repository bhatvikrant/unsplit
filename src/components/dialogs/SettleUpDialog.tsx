import { useMutation, useQuery } from "@/lib/convex";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { minorToDecimalString, parseMoney } from "@convex/lib/money";
import { UserAvatar } from "@/components/common/Avatars";
import { Field } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useDefaultCurrency, useMe } from "@/lib/hooks";
import { CurrencyPicker } from "./pickers";

export type SettleUpOptions = { groupId?: Id<"groups">; friendId?: Id<"users">; payerId?: Id<"users">; payeeId?: Id<"users">; amountMinor?: number; currency?: string };

export function SettleUpDialog({ options, onClose }: { options: SettleUpOptions; onClose: () => void }) {
  const me = useMe();
  const defaultCurrency = useDefaultCurrency();
  const groups = useQuery(api.groups.list);
  const friendsList = useQuery(api.friends.list);
  const record = useMutation(api.expenses.recordPayment);

  const [scope, setScope] = useState<string>(options.groupId ? `group:${options.groupId}` : options.friendId ? `friend:${options.friendId}` : "");
  const [kind, scopeId] = scope.split(":");
  const group = useQuery(api.groups.get, kind === "group" ? { groupId: scopeId as Id<"groups"> } : "skip");
  const friend = useQuery(api.friends.get, kind === "friend" ? { friendId: scopeId as Id<"users"> } : "skip");

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

  // Default payer/payee: me and the first person I owe (or who owes me).
  useEffect(() => {
    if (!me || people.length === 0) return;
    if (!payerId && !payeeId) {
      setPayerId(me._id);
      const other = people.find((p) => p._id !== me._id);
      if (other) setPayeeId(other._id);
    } else if (!payerId) setPayerId(me._id);
  }, [me, people, payerId, payeeId]);

  // Suggested amount: what payer owes payee in this scope, in the chosen currency.
  const owedByPayer = useMemo(() => {
    const out: Record<string, number> = {};
    if (!payerId || !payeeId) return out;
    if (kind === "group" && group) {
      for (const d of group.debts) if (d.from === payerId && d.to === payeeId) out[d.currency] = (out[d.currency] ?? 0) + d.amountMinor;
    } else if (kind === "friend" && friend && me) {
      for (const [cur, v] of Object.entries(friend.total)) {
        // friend.total positive = friend owes me
        if (payerId === me._id && payeeId === friend.user._id && v < 0) out[cur] = -v;
        if (payerId === friend.user._id && payeeId === me._id && v > 0) out[cur] = v;
      }
    }
    return out;
  }, [kind, group, friend, me, payerId, payeeId]);

  useEffect(() => {
    if (amountTouched) return;
    const currencies = Object.keys(owedByPayer);
    if (currencies.length === 0) return;
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
      toast.success("Payment recorded");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const personSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p._id} value={p._id}>
            <span className="flex items-center gap-2">
              <UserAvatar user={p} size="xs" /> {p._id === me?._id ? "You" : p.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Settle up</DialogTitle>
            <DialogDescription>Record a payment that happened in cash, by bank transfer, or any other way.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <Field label="Where" htmlFor="scope">
              <Select value={scope} onValueChange={(v) => { setScope(v); setAmountTouched(false); }}>
                <SelectTrigger id="scope" className="w-full">
                  <SelectValue placeholder="Group or friend" />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => (
                    <SelectItem key={g._id} value={`group:${g._id}`}>
                      {g.name}
                    </SelectItem>
                  ))}
                  {friendsList?.map((f) => (
                    <SelectItem key={f.user._id} value={`friend:${f.user._id}`}>
                      {f.user.name} (no group)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <Field label="Payer">{personSelect(payerId, (v) => { setPayerId(v); setAmountTouched(false); }, "Payer")}</Field>
              <ArrowRight className="text-text-faint mb-2.5 size-4" />
              <Field label="Recipient">{personSelect(payeeId, (v) => { setPayeeId(v); setAmountTouched(false); }, "Recipient")}</Field>
            </div>
            <Field label="Amount" htmlFor="amount" error={error} hint={Object.keys(owedByPayer).length > 1 ? "There are balances in more than one currency. Record one payment per currency." : undefined}>
              <div className="flex gap-2">
                <CurrencyPicker value={currency} compact onChange={(c) => { setCurrency(c); setAmountTouched(true); }} />
                <Input id="amount" inputMode="decimal" required className="tnum text-lg font-semibold" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date" htmlFor="pdate">
                <Input id="pdate" type="date" value={toDateInputValue(date)} onChange={(e) => e.target.value && setDate(fromDateInputValue(e.target.value, date))} />
              </Field>
              <Field label="Note" htmlFor="pnotes">
                <Textarea id="pnotes" rows={1} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
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
