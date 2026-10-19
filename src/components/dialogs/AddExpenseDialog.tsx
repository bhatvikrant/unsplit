import { isTempId, useAction, useMutation, useQuery } from "@/lib/convex";
import { Camera, Loader2, Repeat, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { suggestCategory } from "@convex/lib/categories";
import { minorToDecimalString, parseMoney } from "@convex/lib/money";
import { REPEAT_LABELS, type RepeatInterval } from "@convex/lib/recurring";
import { buildShares, SplitError } from "@convex/lib/split";
import { UserAvatar } from "@/components/common/Avatars";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useDefaultCurrency, useMe } from "@/lib/hooks";
import { CURRENCY_CODES, currencySymbol } from "@convex/lib/currencies";
import { amountText, returnUrl, type Handoff } from "@/lib/handoff";
import { cn } from "@/lib/utils";
import { CategoryPicker, CurrencyPicker } from "./pickers";
import { SplitEditor } from "./SplitEditor";
import { emptySplit, fromSpec, itemizedTotal, newItem, toSpec, type SplitState } from "./splitState";

/** `handoff`: entries sent over by UnMoney, which the form starts from (src/lib/handoff.ts). */
export type AddExpenseOptions = { groupId?: Id<"groups">; friendId?: Id<"users">; expenseId?: Id<"expenses">; handoff?: Handoff };

type Scope = { kind: "group"; id: Id<"groups"> } | { kind: "friend"; id: Id<"users"> } | null;

export function AddExpenseDialog({ options, onClose }: { options: AddExpenseOptions; onClose: () => void }) {
  const me = useMe();
  const defaultCurrency = useDefaultCurrency();
  const groups = useQuery(api.groups.list);
  const friends = useQuery(api.friends.list);
  const existing = useQuery(api.expenses.get, options.expenseId ? { id: options.expenseId } : "skip");
  const create = useMutation(api.expenses.create);
  const update = useMutation(api.expenses.update);
  const uploadUrl = useMutation(api.files.generateUploadUrl);
  const scanReceipt = useAction(api.receipts.scan);

  const [scope, setScope] = useState<Scope>(options.groupId ? { kind: "group", id: options.groupId } : options.friendId ? { kind: "friend", id: options.friendId } : null);
  // From UnMoney: its amounts, date and words; its currency when it is one we know, and our category guessed from its category's name.
  const handoff = options.handoff;
  const handoffCurrency = handoff && CURRENCY_CODES.has(handoff.currency) ? handoff.currency : null;
  const handoffCategory = handoff ? suggestCategory(handoff.category ?? "") : null;
  const group = useQuery(api.groups.get, scope?.kind === "group" ? { groupId: scope.id } : "skip");
  const friend = useQuery(api.friends.get, scope?.kind === "friend" ? { friendId: scope.id } : "skip");

  const [description, setDescription] = useState(handoff?.description ?? "");
  const [amount, setAmount] = useState(() => (handoff ? amountText(handoff.amount, handoffCurrency ?? defaultCurrency) : ""));
  const [currency, setCurrency] = useState<string>(handoffCurrency ?? defaultCurrency);
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(handoffCurrency));
  const [date, setDate] = useState(() => (handoff ? fromDateInputValue(handoff.date) : Date.now()));
  const [category, setCategory] = useState(handoffCategory ?? "general");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(handoffCategory));
  const [notes, setNotes] = useState(handoff?.notes ?? "");
  const [payerMode, setPayerMode] = useState<"single" | "multiple">("single");
  const [payer, setPayer] = useState<string | null>(null);
  const [payers, setPayers] = useState<Record<string, string>>({});
  const [split, setSplit] = useState<SplitState | null>(null);
  const [repeat, setRepeat] = useState<RepeatInterval>("never");
  const [emailReminder, setEmailReminder] = useState(false);
  const [receipt, setReceipt] = useState<{ storageId: Id<"_storage">; previewUrl: string } | null | "remove">(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(Boolean(handoff?.notes));
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  // Mirrors categoryTouched synchronously so the suggestion effect can't run with stale state in the hydration commit.
  const categoryLocked = useRef(Boolean(options.expenseId || handoffCategory));

  const people = useMemo(() => {
    if (scope?.kind === "group" && group) return group.members;
    if (scope?.kind === "friend" && friend && me) return [me, friend.user];
    return [];
  }, [scope, group, friend, me]);
  const peopleIds = useMemo(() => people.map((p) => p._id), [people]);
  const peopleKey = peopleIds.join(",");

  // Reset split state when the participant set changes (and apply the group's default split).
  useEffect(() => {
    if (peopleIds.length === 0) return;
    if (options.expenseId && !hydrated.current) return;
    setSplit((prev) => {
      if (prev && Object.keys(prev.selected).join(",") === peopleKey && prev.method !== "equal") return prev;
      // several entries from UnMoney: a line each, everyone on every line until the user says otherwise
      if (handoff?.items && handoff.items.length > 1 && !options.expenseId) {
        return { ...emptySplit(peopleIds), method: "itemized", items: handoff.items.map((it) => ({ ...newItem(peopleIds), name: it.name, amount: amountText(it.amount, currency) })) };
      }
      if (scope?.kind === "group" && group?.defaultSplit && !options.expenseId) {
        try {
          return fromSpec(group.defaultSplit, peopleIds, currency, (m) => minorToDecimalString(m, currency));
        } catch {
          /* fall through */
        }
      }
      return emptySplit(peopleIds);
    });
    if (!payer && me) setPayer(me._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  // Currency defaults to the group's last currency.
  useEffect(() => {
    if (currencyTouched || options.expenseId) return;
    if (scope?.kind === "group" && group?.lastCurrency) setCurrency(group.lastCurrency);
    else setCurrency(defaultCurrency);
  }, [scope, group?.lastCurrency, defaultCurrency, currencyTouched, options.expenseId]);

  // Hydrate for editing.
  useEffect(() => {
    if (!existing || hydrated.current || !me) return;
    hydrated.current = true;
    if (existing.groupId) setScope({ kind: "group", id: existing.groupId });
    else if (existing.friend) setScope({ kind: "friend", id: existing.friend._id });
    setDescription(existing.description);
    setAmount(minorToDecimalString(existing.amountMinor, existing.currency));
    setCurrency(existing.currency);
    setCurrencyTouched(true);
    setDate(existing.date);
    setCategory(existing.category);
    setCategoryTouched(true);
    categoryLocked.current = true;
    setNotes(existing.notes ?? "");
    setRepeat(existing.repeat);
    setEmailReminder(existing.emailReminder);
    if (existing.receiptUrl && existing.receiptId) setReceipt({ storageId: existing.receiptId, previewUrl: existing.receiptUrl });
    const paid = existing.shares.filter((s) => s.paidMinor > 0);
    if (paid.length === 1) {
      setPayerMode("single");
      setPayer(paid[0].userId);
    } else {
      setPayerMode("multiple");
      setPayers(Object.fromEntries(paid.map((s) => [s.userId, minorToDecimalString(s.paidMinor, existing.currency)])));
    }
    const ids = existing.participants.map((p) => p._id);
    if (existing.splitSpec) setSplit(fromSpec(existing.splitSpec, ids, existing.currency, (m) => minorToDecimalString(m, existing.currency)));
    else setSplit({ ...emptySplit(ids), method: "exact", exact: Object.fromEntries(existing.shares.filter((s) => s.owedMinor > 0).map((s) => [s.userId, minorToDecimalString(s.owedMinor, existing.currency)])) });
    setShowMore(Boolean(existing.notes || existing.repeat !== "never" || existing.receiptUrl));
  }, [existing, me]);

  // Category suggestion from the description.
  useEffect(() => {
    if (categoryTouched || categoryLocked.current) return;
    const s = suggestCategory(description);
    setCategory(s ?? "general");
  }, [description, categoryTouched]);

  // Itemized drives the total.
  const itemTotal = split?.method === "itemized" ? itemizedTotal(split, currency) : null;
  useEffect(() => {
    if (itemTotal !== null && itemTotal >= 0) setAmount(minorToDecimalString(itemTotal, currency));
  }, [itemTotal, currency]);

  const totalMinor = parseMoney(amount, currency);
  const payerList = useMemo(() => {
    if (totalMinor === null) return [];
    if (payerMode === "single") return payer ? [{ userId: payer, paidMinor: totalMinor }] : [];
    return Object.entries(payers)
      .filter(([, v]) => v.trim() !== "")
      .map(([userId, v]) => ({ userId, paidMinor: parseMoney(v, currency) ?? NaN }));
  }, [payerMode, payer, payers, totalMinor, currency]);

  const preview = useMemo(() => {
    if (!split || totalMinor === null || totalMinor <= 0 || payerList.length === 0) return null;
    try {
      const spec = toSpec(split, currency);
      const shares = buildShares(totalMinor, payerList, spec);
      const owed: Record<string, number> = {};
      for (const s of shares) if (s.owedMinor > 0 || spec.method === "reimbursement") owed[s.userId] = s.owedMinor;
      return { owed };
    } catch (e) {
      return { error: e instanceof SplitError ? e.message : typeof e === "string" ? e : "Check the split" };
    }
  }, [split, totalMinor, payerList, currency]);

  const payerNames = people.filter((p) => payerList.some((x) => x.userId === p._id)).map((p) => p.name).join(", ");

  const onFile = async (file: File) => {
    if (!/^image\//.test(file.type)) return toast.error("Receipts must be an image");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image is larger than 10 MB");
    setUploading(true);
    try {
      const url = await uploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setReceipt({ storageId, previewUrl: URL.createObjectURL(file) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const scan = async () => {
    if (!receipt || receipt === "remove") return;
    setScanning(true);
    try {
      const r = await scanReceipt({ storageId: receipt.storageId, fallbackCurrency: currency });
      if (r.currency && r.currency !== currency) {
        setCurrency(r.currency);
        setCurrencyTouched(true);
      }
      if (r.merchant && !description) setDescription(r.merchant);
      if (r.date) setDate(fromDateInputValue(r.date, date));
      const cur = r.currency ?? currency;
      if (r.items.length > 0) {
        setSplit((s) => ({
          ...(s ?? emptySplit(peopleIds)),
          method: "itemized",
          items: r.items.map((it) => ({ ...newItem(peopleIds), name: it.name, amount: minorToDecimalString(it.amountMinor, cur) })),
          tax: r.taxMinor ? minorToDecimalString(r.taxMinor, cur) : "",
          tip: r.tipMinor ? minorToDecimalString(r.tipMinor, cur) : "",
          discount: r.discountMinor ? minorToDecimalString(r.discountMinor, cur) : "",
        }));
        toast.success(`Found ${r.items.length} items. Assign each one.`);
      } else if (r.totalMinor) {
        setAmount(minorToDecimalString(r.totalMinor, cur));
        toast.success("Read the total. No line items found.");
      } else toast.error("Couldn't read anything useful from that receipt");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!scope) return setError("Choose a group or a friend");
    if (!split) return;
    if (totalMinor === null || totalMinor <= 0) return setError("Enter an amount greater than zero");
    if (payerList.length === 0 || payerList.some((p) => Number.isNaN(p.paidMinor))) return setError("Say who paid");
    let spec;
    try {
      spec = toSpec(split, currency);
    } catch (err) {
      return setError(typeof err === "string" ? err : "Check the split");
    }
    setBusy(true);
    try {
      const common = {
        description,
        notes: notes || undefined,
        amountMinor: totalMinor,
        currency,
        date,
        category,
        payers: payerList.map((p) => ({ userId: p.userId as Id<"users">, paidMinor: p.paidMinor })),
        split: spec as never,
        repeat,
        emailReminder,
      };
      if (options.expenseId) {
        await update({
          id: options.expenseId,
          ...common,
          groupId: scope.kind === "group" ? scope.id : null,
          friendId: scope.kind === "friend" ? scope.id : undefined,
          receiptId: receipt === "remove" ? null : receipt ? receipt.storageId : undefined,
        });
      } else {
        const id = await create({
          ...common,
          groupId: scope.kind === "group" ? scope.id : undefined,
          friendId: scope.kind === "friend" ? scope.id : undefined,
          receiptId: receipt && receipt !== "remove" ? receipt.storageId : undefined,
        });
        if (handoff && !isTempId(id)) {
          // back to UnMoney, which links its entries to this expense
          toast.success("Expense added. Back to UnMoney…");
          window.location.assign(returnUrl(handoff, id as string));
          return;
        }
        if (handoff) toast("Expense added offline, so UnMoney could not be told about it");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const editing = Boolean(options.expenseId);
  const loadingEdit = editing && !existing;
  const myNet = preview && "owed" in preview && me ? (payerList.find((p) => p.userId === me._id)?.paidMinor ?? 0) - (preview.owed?.[me._id] ?? 0) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{editing ? "Edit expense" : "Add an expense"}</DialogTitle>
            <DialogDescription className="sr-only">Record a shared expense.</DialogDescription>
          </DialogHeader>
          {handoff ? (
            <p className="bg-surface-2 text-text-muted mx-5 mt-3 rounded-lg px-3 py-2 text-xs">
              From UnMoney: {handoff.items && handoff.items.length > 1 ? `${handoff.items.length} entries, a line each.` : "one entry."} Choose who it is with and who paid; saving takes you back to UnMoney.
            </p>
          ) : null}

          <div className="space-y-5 px-5 pt-3 pb-5">
            {/* Scope */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted inline-flex items-center gap-1.5"><Users className="text-text-faint size-4" /> With</span>
              <Select
                value={scope ? `${scope.kind}:${scope.id}` : ""}
                onValueChange={(v) => {
                  const [kind, id] = v.split(":");
                  setScope(kind === "group" ? { kind: "group", id: id as Id<"groups"> } : { kind: "friend", id: id as Id<"users"> });
                }}
                disabled={loadingEdit}
              >
                <SelectTrigger className="bg-surface-2 hover:bg-surface-3 h-8 w-auto max-w-[260px] min-w-40 rounded-full font-medium shadow-none" aria-label="Group or friend">
                  <SelectValue placeholder="Choose a group or friend" />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => (
                    <SelectItem key={g._id} value={`group:${g._id}`}>
                      {g.name}
                    </SelectItem>
                  ))}
                  {friends?.map((f) => (
                    <SelectItem key={f.user._id} value={`friend:${f.user._id}`}>
                      {f.user.name} (no group)
                    </SelectItem>
                  ))}
                  {groups?.length === 0 && friends?.length === 0 ? <div className="text-text-muted px-2 py-1.5 text-xs">Create a group or add a friend first.</div> : null}
                </SelectContent>
              </Select>
            </div>

            {/* Amount hero + description */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-text-faint shrink-0 text-xl font-medium">{currencySymbol(currency)}</span>
                <Input
                  aria-label="Amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  readOnly={split?.method === "itemized"}
                  autoFocus={!editing}
                  className={cn("tnum h-12 flex-1 bg-transparent px-0 text-[40px] font-semibold tracking-[-0.03em] shadow-none placeholder:text-text-faint/50 focus-visible:shadow-none md:text-[40px]", split?.method === "itemized" && "text-text-muted")}
                />
                <CurrencyPicker
                  value={currency}
                  compact
                  onChange={(c) => {
                    setCurrency(c);
                    setCurrencyTouched(true);
                  }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <CategoryPicker
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setCategoryTouched(true);
                    categoryLocked.current = true;
                  }}
                />
                <Input aria-label="Description" placeholder="What was it for?" required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* Paid by */}
            {people.length > 0 && split ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-text-muted text-xs font-semibold">Paid by</span>
                  {payerMode === "single" ? (
                    <Select value={payer ?? ""} onValueChange={setPayer}>
                      <SelectTrigger className="h-8 w-auto min-w-28 rounded-full font-medium" aria-label="Who paid">
                        <SelectValue placeholder="Who paid?" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {p._id === me?._id ? "You" : p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium">several people</span>
                  )}
                  <button
                    type="button"
                    className="text-brand ml-auto text-xs font-medium hover:underline"
                    onClick={() => {
                      if (payerMode === "single") {
                        setPayerMode("multiple");
                        if (payer && totalMinor !== null) setPayers({ [payer]: minorToDecimalString(totalMinor, currency) });
                      } else setPayerMode("single");
                    }}
                  >
                    {payerMode === "single" ? "Multiple people paid" : "One person paid"}
                  </button>
                </div>
                {payerMode === "multiple" ? (
                  <ul className="shadow-ring divide-y overflow-hidden rounded-xl">
                    {people.map((p) => (
                      <li key={p._id} className="flex items-center gap-3 px-3 py-1.5">
                        <UserAvatar user={p} size="xs" />
                        <span className="flex-1 truncate text-sm">{p.name}</span>
                        <Input inputMode="decimal" aria-label={`${p.name} paid`} className="tnum w-28 text-right" placeholder="0" value={payers[p._id] ?? ""} onChange={(e) => setPayers((x) => ({ ...x, [p._id]: e.target.value }))} />
                      </li>
                    ))}
                    <li className="text-text-muted flex justify-between px-3 py-1.5 text-xs">
                      <span>Paid so far</span>
                      <Money minor={payerList.reduce((a, b) => a + (Number.isNaN(b.paidMinor) ? 0 : b.paidMinor), 0)} currency={currency} />
                      {totalMinor !== null ? (
                        <span>
                          of <Money minor={totalMinor} currency={currency} />
                        </span>
                      ) : null}
                    </li>
                  </ul>
                ) : null}
                <SplitEditor state={split} onChange={setSplit} people={people} currency={currency} totalMinor={totalMinor} preview={preview} payerNames={payerNames} />
              </div>
            ) : scope ? (
              <div className="text-text-muted flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading people…
              </div>
            ) : null}

            {/* Date + more */}
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" aria-label="Date" className="bg-surface-2 h-8 w-auto rounded-lg text-[13px] font-medium shadow-none" value={toDateInputValue(date)} onChange={(e) => e.target.value && setDate(fromDateInputValue(e.target.value, date))} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" className={cn(repeat !== "never" && "bg-brand-soft text-brand-ink hover:bg-brand-soft")}>
                    <Repeat /> {REPEAT_LABELS[repeat]}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="space-y-1">
                    {(Object.keys(REPEAT_LABELS) as RepeatInterval[]).map((r) => (
                      <button key={r} type="button" onClick={() => setRepeat(r)} className={cn("hover:bg-surface block w-full rounded-sm px-2 py-1.5 text-left text-sm", r === repeat && "bg-brand-soft text-brand font-medium")}>
                        {REPEAT_LABELS[r]}
                      </button>
                    ))}
                  </div>
                  {repeat !== "never" ? (
                    <label className="mt-2 flex items-center gap-2 border-t px-2 pt-2 text-xs">
                      <Checkbox checked={emailReminder} onCheckedChange={(v) => setEmailReminder(Boolean(v))} /> Email everyone the day before
                    </label>
                  ) : null}
                </PopoverContent>
              </Popover>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
              <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Camera />} {receipt && receipt !== "remove" ? "Replace receipt" : "Add receipt"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowMore((v) => !v)}>
                {showMore ? "Fewer options" : "Notes"}
              </Button>
            </div>

            {receipt && receipt !== "remove" ? (
              <div className="shadow-ring flex items-center gap-3 rounded-xl p-2">
                <img src={receipt.previewUrl} alt="Receipt" className="size-16 rounded object-cover" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">Receipt attached</div>
                  <div className="text-text-muted text-xs">Scan it to fill in the items and total automatically.</div>
                </div>
                <Button type="button" size="sm" variant="secondary" disabled={scanning} onClick={() => void scan()}>
                  {scanning ? <Loader2 className="animate-spin" /> : null} {scanning ? "Reading…" : "Scan receipt"}
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={() => setReceipt(editing ? "remove" : null)}>
                  <X />
                </Button>
              </div>
            ) : null}

            {showMore ? <Textarea aria-label="Notes" placeholder="Notes (optional)" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /> : null}

            {error ? (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="bg-bg rounded-b-2xl border-t px-5 py-4">
            {myNet !== null && myNet !== 0 ? (
              <span className="text-text-faint self-center text-xs sm:mr-auto">
                You'll {myNet > 0 ? "lend" : "borrow"} <Money minor={myNet} currency={currency} abs className="text-text font-medium" />
              </span>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || loadingEdit || !scope || Boolean(preview && "error" in preview)}>
              {busy ? "Saving…" : editing ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
