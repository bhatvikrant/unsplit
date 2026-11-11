import { isTempId, useAction, useMutation, useQuery } from "@/lib/convex";
import { CalendarDays, Camera, Loader2, Plus, Repeat, ScanText, StickyNote, UserPlus, Users, Wallet, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { suggestCategory } from "@convex/lib/categories";
import { minorToDecimalString, parseMoney } from "@convex/lib/money";
import { REPEAT_LABELS, type RepeatInterval } from "@convex/lib/recurring";
import { buildShares, SplitError, splitErrorMessage } from "@convex/lib/split";
import { GroupAvatar, UserAvatar } from "@/components/common/Avatars";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Picker, PickerGroup, PickerItem, PickerLabel, PickerSeparator } from "@/components/ui/picker";
import { RECEIPT_EDGE, uploadImage } from "@/lib/image";
import { errorMessage, formatDate, fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useDefaultCurrency, useMe } from "@/lib/hooks";
import { CURRENCY_CODES } from "@convex/lib/currencies";
import { amountText, returnUrl, type Handoff } from "@/lib/handoff";
import { defaultScope, rememberScope } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { FriendFormFields, useFriendForm } from "./FriendForm";
import { GroupFormFields, useGroupForm } from "./GroupForm";
import { CategoryPicker, CurrencyPicker } from "./pickers";
import { FormCard, Row, RowBody, RowButton, RowIcon, RowPicker } from "./FormRows";
import { SplitEditor, SplitMethodRow } from "./SplitEditor";
import { emptySplit, exactFromAmounts, fromSpec, itemizedTotal, newItem, toSpec, type SplitState } from "./splitState";

/** `handoff`: entries sent over by UnMoney, which the form starts from (src/lib/handoff.ts). */
export type AddExpenseOptions = { groupId?: Id<"groups">; friendId?: Id<"users">; expenseId?: Id<"expenses">; handoff?: Handoff };

type Scope = { kind: "group"; id: Id<"groups"> } | { kind: "friend"; id: Id<"users"> } | null;

/** The "Paid by" choice that switches to typing what each person paid. */
const SEVERAL = "__several";

/** "Today, 12 Nov", "Yesterday, 11 Nov", "Mon, 3 Nov" or "3 Nov 2025". */
function dateLabel(ms: number): string {
  const d = new Date(ms);
  const day = (offset: number) => {
    const x = new Date();
    x.setDate(x.getDate() + offset);
    return x.toDateString();
  };
  if (d.toDateString() === day(0)) return `Today, ${formatDate(ms, "monthDay")}`;
  if (d.toDateString() === day(-1)) return `Yesterday, ${formatDate(ms, "monthDay")}`;
  return d.getFullYear() === new Date().getFullYear() ? `${d.toLocaleDateString("en-GB", { weekday: "short" })}, ${formatDate(ms, "monthDay")}` : formatDate(ms);
}

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
  // Set from the outside or by hand: then the remembered scope (src/lib/scope.ts) must not take over.
  const scopeTouched = useRef(Boolean(options.groupId || options.friendId || options.expenseId));
  const pickScope = (s: Scope) => {
    scopeTouched.current = true;
    setScope(s);
    setCreating(null);
  };
  // A group or friend made right here, from the "With" picker, becomes the expense's scope.
  const [creating, setCreating] = useState<"group" | "friend" | null>(null);
  const groupForm = useGroupForm({ onCreated: (id) => pickScope({ kind: "group", id }) });
  const friendForm = useFriendForm({ onAdded: (id) => pickScope({ kind: "friend", id }) });
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

  // Form state derived from loaded data runs in layout effects: the dialog paints once, filled in,
  // instead of flashing "$", empty fields or "Loading people…" for a frame.
  // Reset split state when the participant set changes (and apply the group's default split).
  useLayoutEffect(() => {
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

  // Nothing chosen: start on the scope used last time, or the only one there is.
  useLayoutEffect(() => {
    if (scope || scopeTouched.current || !groups || !friends) return;
    const d = defaultScope(groups.map((g) => g._id), friends.map((f) => f.user._id));
    if (d) setScope(d.kind === "group" ? { kind: "group", id: d.id as Id<"groups"> } : { kind: "friend", id: d.id as Id<"users"> });
  }, [scope, groups, friends]);

  // Currency defaults to the group's last currency.
  useLayoutEffect(() => {
    if (currencyTouched || options.expenseId) return;
    if (scope?.kind === "group" && group?.lastCurrency) setCurrency(group.lastCurrency);
    else setCurrency(defaultCurrency);
  }, [scope, group?.lastCurrency, defaultCurrency, currencyTouched, options.expenseId]);

  // Hydrate for editing.
  useLayoutEffect(() => {
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
    else setSplit({ ...emptySplit(ids), method: "exact", ...exactFromAmounts(Object.fromEntries(existing.shares.filter((s) => s.owedMinor > 0).map((s) => [s.userId, s.owedMinor])), ids, (m) => minorToDecimalString(m, existing.currency)) });
  }, [existing, me]);

  // Category suggestion from the description.
  useLayoutEffect(() => {
    if (categoryTouched || categoryLocked.current) return;
    const s = suggestCategory(description);
    setCategory(s ?? "general");
  }, [description, categoryTouched]);

  // Itemized drives the total.
  const itemTotal = split?.method === "itemized" ? itemizedTotal(split, currency) : null;
  useLayoutEffect(() => {
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
      const spec = toSpec(split, currency, { ids: peopleIds, totalMinor });
      const shares = buildShares(totalMinor, payerList, spec);
      const owed: Record<string, number> = {};
      for (const s of shares) if (s.owedMinor > 0 || spec.method === "reimbursement") owed[s.userId] = s.owedMinor;
      return { owed };
    } catch (e) {
      return { error: e instanceof SplitError ? splitErrorMessage(e, currency) : typeof e === "string" ? e : "Check the split" };
    }
  }, [split, totalMinor, payerList, currency, peopleIds]);

  const payerPerson = people.find((p) => p._id === payer);
  const payerLabel = payerPerson ? (payerPerson._id === me?._id ? "You" : payerPerson.name) : "";
  const payerNames = people.filter((p) => payerList.some((x) => x.userId === p._id)).map((p) => p.name).join(", ");

  const onFile = async (file: File) => {
    if (!/^image\//.test(file.type)) return toast.error("Receipts must be an image");
    setUploading(true);
    try {
      // shrunk first (src/lib/image.ts), so a full-size phone shot goes through and takes a fraction of the space
      const { storageId, file: small } = await uploadImage(uploadUrl, file, RECEIPT_EDGE);
      setReceipt({ storageId, previewUrl: URL.createObjectURL(small) });
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
      spec = toSpec(split, currency, { ids: peopleIds, totalMinor });
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
        rememberScope(scope);
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
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg"
        size="full"
        sheetClassName="pb-0 [--sheet-px:0px]"
        action={{ label: busy ? "Saving…" : "Save", type: "submit", disabled: busy || loadingEdit || !scope || Boolean(preview && "error" in preview) }}
      >
        <form onSubmit={submit} className="flex flex-col">
          <DialogHeader className="sm:px-5 sm:pt-5">
            <DialogTitle>{editing ? "Edit expense" : "Add an expense"}</DialogTitle>
            <DialogDescription className="sr-only">Record a shared expense.</DialogDescription>
            {/* Phones: what this expense does to my balance, under the sheet's top bar so it stays in view while the form scrolls. The row is always there so the form does not jump when it fills in. */}
            <p className="text-text-faint col-span-full row-start-2 min-h-4 pb-1.5 text-center text-xs leading-4 sm:hidden" aria-live="polite">
              {myNet !== null && myNet !== 0 ? (
                <>
                  You'll {myNet > 0 ? "lend" : "borrow"} <Money minor={myNet} currency={currency} abs className="text-text font-medium" />
                </>
              ) : null}
            </p>
          </DialogHeader>
          {handoff ? (
            <p className="bg-surface-2 text-text-muted mx-5 mt-3 rounded-lg px-3 py-2 text-xs">
              From UnMoney: {handoff.items && handoff.items.length > 1 ? `${handoff.items.length} entries, a line each.` : "one entry."} Choose who it is with and who paid; saving takes you back to UnMoney.
            </p>
          ) : null}

          <div className="space-y-5 px-5 pt-3 pb-5">
            {/* Scope */}
            <div className="space-y-3">
              <div className="flex justify-center">
                <Picker
                  value={scope ? `${scope.kind}:${scope.id}` : ""}
                  onValueChange={(v) => {
                    const [kind, id] = v.split(":");
                    if (kind === "new") setCreating(id === "group" ? "group" : "friend");
                    else pickScope(kind === "group" ? { kind: "group", id: id as Id<"groups"> } : { kind: "friend", id: id as Id<"users"> });
                  }}
                  disabled={loadingEdit}
                  placeholder="Choose a group or friend"
                  aria-label="Group or friend"
                  title="With"
                  className="bg-surface-2 hover:bg-surface-3 h-9 w-auto max-w-[280px] min-w-40 rounded-full pr-3 pl-1.5 font-medium shadow-none"
                >
                  {groups && groups.length > 0 ? (
                    <PickerGroup>
                      <PickerLabel>Groups</PickerLabel>
                      {groups.map((g) => (
                        <PickerItem key={g._id} value={`group:${g._id}`} icon={<GroupAvatar group={g} size="xs" />} meta={`${g.memberCount} ${g.memberCount === 1 ? "member" : "members"}`}>
                          {g.name}
                        </PickerItem>
                      ))}
                    </PickerGroup>
                  ) : null}
                  {friends && friends.length > 0 ? (
                    <PickerGroup>
                      <PickerLabel>Friends</PickerLabel>
                      {friends.map((f) => (
                        <PickerItem key={f.user._id} value={`friend:${f.user._id}`} icon={<UserAvatar user={f.user} size="xs" />}>
                          {f.user.name}
                        </PickerItem>
                      ))}
                    </PickerGroup>
                  ) : null}
                  {(groups && groups.length > 0) || (friends && friends.length > 0) ? <PickerSeparator /> : null}
                  <PickerItem value="new:group">
                    <Plus /> New group
                  </PickerItem>
                  <PickerItem value="new:friend">
                    <UserPlus /> New friend
                  </PickerItem>
                </Picker>
              </div>
              {!creating && groups?.length === 0 && friends?.length === 0 ? (
                <p className="text-text-muted text-xs">No groups or friends yet. Start one from the list above; you can invite people by email.</p>
              ) : null}
              {creating ? (
                <div className="shadow-ring space-y-3 rounded-xl p-3" data-testid={`new-${creating}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{creating === "group" ? "New group" : "New friend"}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setCreating(null)}>
                      <X />
                    </Button>
                  </div>
                  {creating === "group" ? <GroupFormFields form={groupForm} friends={friends} compact idPrefix="xg" /> : <FriendFormFields form={friendForm} idPrefix="xf" />}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(null)}>
                      Cancel
                    </Button>
                    {creating === "group" ? (
                      <Button type="button" size="sm" disabled={!groupForm.canSubmit} onClick={() => void groupForm.submit()}>
                        {groupForm.busy ? "Creating…" : "Create group"}
                      </Button>
                    ) : (
                      <Button type="button" size="sm" disabled={!friendForm.canSubmit} onClick={() => void friendForm.submit()}>
                        {friendForm.busy ? "Adding…" : "Add friend"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Amount hero + description */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-1.5">
                <CurrencyPicker
                  value={currency}
                  symbol
                  onChange={(c) => {
                    setCurrency(c);
                    setCurrencyTouched(true);
                  }}
                />
                {/* Sized to what's typed, so the amount sits centred: a hidden copy of the text sets the width. */}
                <span className="inline-grid min-w-0">
                  <span aria-hidden className="tnum invisible col-start-1 row-start-1 overflow-hidden px-0.5 text-[44px] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-pre">
                    {amount || "0.00"}
                  </span>
                  <input
                    aria-label="Amount"
                    inputMode="decimal"
                    size={1}
                    placeholder="0.00"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    readOnly={split?.method === "itemized"}
                    autoFocus={!editing}
                    className={cn("tnum placeholder:text-text-faint/50 col-start-1 row-start-1 w-full min-w-0 bg-transparent px-0.5 text-center text-[44px] leading-[1.15] font-semibold tracking-[-0.03em] outline-none", split?.method === "itemized" && "text-text-muted")}
                  />
                </span>
                {/* Balances the currency button, so the amount sits in the middle. */}
                <span aria-hidden className="w-9 shrink-0" />
              </div>
              <div className="bg-surface shadow-ring focus-within:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--ring)] flex items-center gap-1 rounded-2xl p-1 transition-shadow">
                <CategoryPicker
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setCategoryTouched(true);
                    categoryLocked.current = true;
                  }}
                />
                <Input aria-label="Description" placeholder="What was it for?" required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="h-11 bg-transparent px-2 text-[16px] shadow-none! sm:text-sm" />
              </div>
            </div>

            {/* Who paid and how it's split */}
            {people.length > 0 && split ? (
              <div className="space-y-3">
                <FormCard>
                  <RowPicker
                    icon={<Wallet />}
                    label="Paid by"
                    title="Paid by"
                    aria-label={`Paid by: ${payerMode === "multiple" ? "several people" : payerLabel}`}
                    value={payerMode === "multiple" ? SEVERAL : (payer ?? "")}
                    display={
                      payerMode === "multiple" ? (
                        "Several people"
                      ) : payerPerson ? (
                        <>
                          <UserAvatar user={payerPerson} size="xs" /> {payerLabel}
                        </>
                      ) : (
                        "Choose"
                      )
                    }
                    strong
                    options={[
                      ...people.map((p) => ({ value: p._id, label: p._id === me?._id ? "You" : p.name, icon: <UserAvatar user={p} size="xs" /> })),
                      { value: SEVERAL, label: "Several people", description: "Say how much each one paid", icon: <span className="bg-surface-2 text-text-muted flex size-6 items-center justify-center rounded-full"><Users className="size-3.5" /></span> },
                    ]}
                    onValueChange={(v) => {
                      if (v === SEVERAL) {
                        if (payerMode === "single" && payer && totalMinor !== null) setPayers({ [payer]: minorToDecimalString(totalMinor, currency) });
                        setPayerMode("multiple");
                      } else {
                        setPayerMode("single");
                        setPayer(v);
                      }
                    }}
                  />
                  <SplitMethodRow state={split} onChange={setSplit} ids={peopleIds} currency={currency} />
                </FormCard>
                {payerMode === "multiple" ? (
                  <FormCard title="Who paid what">
                    {people.map((p) => (
                      <Row key={p._id}>
                        <UserAvatar user={p} size="sm" />
                        <RowBody className="min-h-14 py-2">
                          <span className="flex-1 truncate text-[15px] sm:text-sm">{p.name}</span>
                          <Input inputMode="decimal" aria-label={`${p.name} paid`} className="tnum w-28 text-right" placeholder="0" value={payers[p._id] ?? ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPayers((x) => ({ ...x, [p._id]: e.target.value }))} />
                        </RowBody>
                      </Row>
                    ))}
                    <Row className="text-text-muted text-xs">
                      <RowBody className="justify-between">
                        <span>Paid so far</span>
                        <span>
                          <Money minor={payerList.reduce((a, b) => a + (Number.isNaN(b.paidMinor) ? 0 : b.paidMinor), 0)} currency={currency} />
                          {totalMinor !== null ? (
                            <>
                              {" "}
                              of <Money minor={totalMinor} currency={currency} />
                            </>
                          ) : null}
                        </span>
                      </RowBody>
                    </Row>
                  </FormCard>
                ) : null}
                <SplitEditor state={split} onChange={setSplit} people={people} currency={currency} totalMinor={totalMinor} preview={preview} payerNames={payerNames} />
              </div>
            ) : scope ? (
              <div className="text-text-muted flex items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading people…
              </div>
            ) : null}

            {/* Details */}
            <FormCard title="Details">
              <div data-row="" className="relative">
                <RowButton icon={<CalendarDays />} label="Date" value={dateLabel(date)} tabIndex={-1} aria-hidden className="pointer-events-none" />
                {/* The real control: an invisible date input over the whole row, so a tap opens the system date picker. */}
                <input
                  type="date"
                  aria-label="Date"
                  value={toDateInputValue(date)}
                  onChange={(e) => e.target.value && setDate(fromDateInputValue(e.target.value, date))}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {
                      /* older browsers open it themselves */
                    }
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </div>
              <RowPicker
                icon={<Repeat />}
                label="Repeat"
                title="Repeat"
                aria-label={`Repeat: ${REPEAT_LABELS[repeat]}`}
                value={repeat}
                strong={repeat !== "never"}
                closeOnSelect={false}
                options={(Object.keys(REPEAT_LABELS) as RepeatInterval[]).map((r) => ({ value: r, label: REPEAT_LABELS[r] }))}
                onValueChange={(r) => setRepeat(r as RepeatInterval)}
                footer={
                  repeat !== "never" ? (
                    <>
                      <label className="flex min-h-11 items-center gap-3 text-[15px] sm:min-h-8 sm:text-xs">
                        <Checkbox checked={emailReminder} onCheckedChange={(v) => setEmailReminder(Boolean(v))} /> Email everyone the day before
                      </label>
                      <p className="text-text-faint mt-1 text-xs">A copy is posted on each date with the same split. To change later ones, edit the newest copy.</p>
                    </>
                  ) : null
                }
              />
              {receipt && receipt !== "remove" ? (
                <Row>
                  <img src={receipt.previewUrl} alt="Receipt" className="size-8 shrink-0 rounded-lg object-cover" />
                  <RowBody className="min-h-14 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] sm:text-sm">Receipt</span>
                      <button type="button" className="text-text-faint block text-xs hover:underline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                        {uploading ? "Uploading…" : "Replace photo"}
                      </button>
                    </span>
                    <Button type="button" size="sm" variant="secondary" disabled={scanning} onClick={() => void scan()}>
                      {scanning ? <Loader2 className="animate-spin" /> : <ScanText />} {scanning ? "Reading…" : "Scan"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={() => setReceipt(editing ? "remove" : null)}>
                      <X />
                    </Button>
                  </RowBody>
                </Row>
              ) : (
                <RowButton icon={uploading ? <Loader2 className="animate-spin" /> : <Camera />} label="Receipt" value="Add photo" disabled={uploading} onClick={() => fileRef.current?.click()} />
              )}
              <Row className="items-start">
                <RowIcon className="mt-2">
                  <StickyNote />
                </RowIcon>
                <RowBody className="py-0">
                  <textarea
                    aria-label="Notes"
                    placeholder="Add a note"
                    rows={1}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="placeholder:text-text-faint field-sizing-content min-h-12 w-full resize-none bg-transparent py-3 text-[15px] leading-6 outline-none sm:text-sm"
                  />
                </RowBody>
              </Row>
            </FormCard>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />

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
