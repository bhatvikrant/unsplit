import { useConvex, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, BarChart3, Check, Copy, Download, HandCoins, Link2, Plus, Receipt, RefreshCw, Settings, Sigma, Undo2, UserMinus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { GroupAvatar, GROUP_TYPE_LABELS, UserAvatar } from "@/components/common/Avatars";
import { ExpenseList } from "@/components/common/ExpenseList";
import { EmptyState, Field, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { BalanceChip, BalanceSummary, Money } from "@/components/common/Money";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import { SplitEditor } from "@/components/dialogs/SplitEditor";
import { emptySplit, fromSpec, toSpec, type SplitState } from "@/components/dialogs/splitState";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile, errorMessage, monthLabel, pluralize, toCsv } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { usePagedExpenses } from "@/lib/usePagedExpenses";
import { cn } from "@/lib/utils";
import { NotFound } from "./NotFound";

type GroupType = "home" | "trip" | "couple" | "other";

function useGroup() {
  const { id } = useParams();
  const groupId = id as Id<"groups">;
  const [failed, setFailed] = useState(false);
  const group = useQuery(api.groups.get, id ? { groupId } : "skip");
  useEffect(() => {
    const t = setTimeout(() => group === undefined && setFailed(true), 8000);
    return () => clearTimeout(t);
  }, [group]);
  return { groupId, group, failed };
}

export function GroupNav({ groupId, current }: { groupId: Id<"groups">; current: "expenses" | "totals" | "charts" | "settings" }) {
  const items = [
    { key: "expenses", to: `/groups/${groupId}`, label: "Expenses", icon: Receipt },
    { key: "totals", to: `/groups/${groupId}/totals`, label: "Totals", icon: Sigma },
    { key: "charts", to: `/groups/${groupId}/charts`, label: "Charts", icon: BarChart3 },
    { key: "settings", to: `/groups/${groupId}/settings`, label: "Settings", icon: Settings },
  ] as const;
  return (
    <nav className="no-scrollbar mb-5 flex gap-0.5 overflow-x-auto border-b" aria-label="Group sections">
      {items.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          aria-current={current === it.key ? "page" : undefined}
          className={cn(
            "relative flex items-center gap-1.5 rounded-t-lg px-3 pt-2 pb-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring",
            "after:bg-brand after:absolute after:right-2.5 after:bottom-[-1px] after:left-2.5 after:h-0.5 after:rounded-full after:opacity-0 after:transition-opacity after:duration-150",
            current === it.key ? "text-text after:opacity-100 [&>svg]:text-brand" : "text-text-muted hover:text-text",
          )}
        >
          <it.icon className="size-4" /> {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function GroupPage() {
  const { groupId, group, failed } = useGroup();
  const me = useMe();
  const dialogs = useDialogs();
  const restore = useMutation(api.groups.restore);
  const convex = useConvex();
  const { items, hasMore, loadMore, loadingMore } = usePagedExpenses({ groupId });
  const [copied, setCopied] = useState(false);

  if (group === undefined) return failed ? <NotFound /> : <RowSkeleton />;
  const byId = new Map(group.members.map((m) => [m._id, m]));
  const name = (id: string) => (id === me?._id ? "You" : byId.get(id as Id<"users">)?.name ?? "Someone");
  const inviteLink = `${window.location.origin}/join/${group.inviteCode}`;

  const exportCsv = async () => {
    const { headers, rows } = await convex.query(api.exports.csv, { groupId });
    downloadFile(`${group.name.replace(/[^\w-]+/g, "_")}.csv`, toCsv(headers, rows), "text/csv");
  };

  return (
    <div>
      {group.deletedAt ? (
        <div className="bg-negative-soft text-negative mb-4 flex items-center justify-between rounded-md px-3 py-2 text-sm">
          <span>This group was deleted. Its expenses no longer count toward balances.</span>
          <Button size="sm" variant="outline" onClick={() => restore({ groupId }).then(() => toast.success("Group restored")).catch((e) => toast.error(errorMessage(e)))}>
            <Undo2 /> Restore
          </Button>
        </div>
      ) : null}
      <PageHeader
        leading={<GroupAvatar group={group} size="lg" />}
        title={group.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2">
            {GROUP_TYPE_LABELS[group.type]} · {pluralize(group.members.length, "member")}
            {group.simplifyDebts ? <span>· simplified debts</span> : null}
          </span>
        }
        actions={
          !group.deletedAt ? (
            <>
              <Button onClick={() => dialogs.addExpense({ groupId })}>
                <Plus /> Add expense
              </Button>
              <Button variant="secondary" onClick={() => dialogs.settleUp({ groupId })}>
                <HandCoins /> Settle up
              </Button>
            </>
          ) : null
        }
      />
      <GroupNav groupId={groupId} current="expenses" />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <ExpenseList
            items={items}
            hasMore={hasMore}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            empty={
              <EmptyState
                icon={Receipt}
                title="No expenses yet"
                description="Add the first one, or share the invite link so others can join."
                action={
                  !group.deletedAt ? (
                    <Button onClick={() => dialogs.addExpense({ groupId })}>
                      <Plus /> Add expense
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>
        <aside className="space-y-4">
          <Section title="Balances">
            <ul className="px-2 pt-1.5 pb-2">
              {group.members.map((m) => {
                const nets = group.memberNets[m._id] ?? {};
                const main = Object.entries(nets).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
                const max = Math.max(1, ...group.members.flatMap((x) => Object.values(group.memberNets[x._id] ?? {}).map(Math.abs)));
                return (
                  <li key={m._id} className="grid grid-cols-[28px_1fr_auto] items-center gap-x-2.5 px-2 py-1.5">
                    <UserAvatar user={m} size="sm" className="size-7 text-[10px]" />
                    <span className="min-w-0 truncate text-sm font-medium">{m._id === me?._id ? "You" : m.name}</span>
                    <BalanceChip balances={nets} plain />
                    <div className="bg-surface-2 col-start-2 col-end-4 mt-1.5 h-1 overflow-hidden rounded-full">
                      {main && main[1] !== 0 ? (
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-300 ease-out-strong", main[1] > 0 ? "bg-positive" : "bg-negative")}
                          style={{ width: `${Math.max(6, Math.round((Math.abs(main[1]) / max) * 100))}%` }}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {group.debts.length > 0 ? (
              <ul className="space-y-0.5 border-t px-2 py-2 text-[13px]">
                {group.debts.map((d, i) => (
                  <li key={i} className="hover:bg-surface-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors duration-100">
                    <span className={cn("truncate", d.from === me?._id && "font-medium")}>{name(d.from)}</span>
                    <ArrowRight className="text-text-faint size-3.5 shrink-0" />
                    <span className={cn("truncate", d.to === me?._id && "font-medium")}>{name(d.to)}</span>
                    <Money minor={d.amountMinor} currency={d.currency} className="ml-auto font-semibold tracking-[-0.01em]" />
                    {!group.deletedAt ? (
                      <button
                        type="button"
                        className={cn("ml-1 text-xs font-semibold hover:underline", d.from === me?._id || d.to === me?._id ? "text-brand" : "text-text-faint")}
                        onClick={() => dialogs.settleUp({ groupId, payerId: d.from as Id<"users">, payeeId: d.to as Id<"users">, amountMinor: d.amountMinor, currency: d.currency })}
                      >
                        {d.from === me?._id ? "Settle" : d.to === me?._id ? "Remind" : "Record"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-faint border-t px-4 py-3 text-xs">Everyone is settled up.</p>
            )}
          </Section>

          {group.whiteboard ? (
            <Section title="Whiteboard">
              <p className="px-4 py-3 text-sm whitespace-pre-wrap">{group.whiteboard}</p>
            </Section>
          ) : null}

          <Section title="Invite link">
            <div className="flex items-center gap-2 py-2 pr-2 pl-4">
              <Link2 className="text-text-faint size-4 shrink-0" />
              <code className="text-text-muted min-w-0 flex-1 truncate text-xs">{inviteLink.replace(/^https?:\/\//, "")}</code>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Copy invite link"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="text-positive" /> : <Copy />}
              </Button>
            </div>
          </Section>

          <div className="flex flex-col gap-0.5 px-1">
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => void exportCsv()}>
              <Download /> Export as spreadsheet
            </Button>
            {!group.deletedAt ? (
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => dialogs.convertCurrency({ groupId })}>
                <RefreshCw /> Convert to one currency
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function GroupTotals() {
  const { groupId, group, failed } = useGroup();
  const [month, setMonth] = useState<string>("all");
  const totals = useQuery(api.groups.totals, { groupId, month: month === "all" ? undefined : month });
  if (group === undefined) return failed ? <NotFound /> : <RowSkeleton />;
  const metrics = [
    ["groupSpending", "Total group spending"],
    ["youPaid", "Total you paid for"],
    ["yourShare", "Your total share"],
    ["paymentsMade", "Payments you made"],
    ["paymentsReceived", "Payments you received"],
    ["change", "Change in your balance"],
  ] as const;
  return (
    <div>
      <PageHeader leading={<GroupAvatar group={group} size="lg" />} title={group.name} subtitle="Totals" />
      <GroupNav groupId={groupId} current="totals" />
      <div className="mb-4 flex items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-48" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            {totals?.months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {totals === undefined ? (
        <RowSkeleton />
      ) : Object.keys(totals.totals).length === 0 ? (
        <EmptyState icon={Sigma} title="Nothing in this period" description="Totals cover expenses and payments dated in the period you pick." />
      ) : (
        Object.entries(totals.totals).map(([currency, t]) => (
          <div key={currency} className="mb-6">
            {Object.keys(totals.totals).length > 1 ? <h2 className="text-text-muted mb-2 text-sm font-medium">{currency}</h2> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map(([k, label]) => (
                <div key={k} className="card p-4">
                  <div className="text-text-muted text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-semibold tracking-[-0.02em]">
                    <Money minor={t[k]} currency={currency} tone={k === "change" ? "auto" : "neutral"} signDisplay={k === "change" ? "exceptZero" : "auto"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function GroupSettings() {
  const { groupId, group, failed } = useGroup();
  const me = useMe();
  const navigate = useNavigate();
  const update = useMutation(api.groups.update);
  const addMember = useMutation(api.groups.addMember);
  const removeMember = useMutation(api.groups.removeMember);
  const remove = useMutation(api.groups.remove);
  const regenerate = useMutation(api.groups.regenerateInvite);
  const uploadUrl = useMutation(api.files.generateUploadUrl);
  const friends = useQuery(api.friends.list);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<GroupType>("other");
  const [whiteboard, setWhiteboard] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pickFriend, setPickFriend] = useState("");
  const [split, setSplit] = useState<SplitState | null>(null);
  const [defaultOn, setDefaultOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  const memberIds = useMemo(() => group?.members.map((m) => m._id) ?? [], [group]);
  useEffect(() => {
    if (!group || loaded.current) return;
    loaded.current = true;
    setName(group.name);
    setType(group.type);
    setWhiteboard(group.whiteboard);
    setDefaultOn(Boolean(group.defaultSplit));
    setSplit(group.defaultSplit ? fromSpec(group.defaultSplit, memberIds, group.lastCurrency ?? "USD", (m) => String(m / 100)) : emptySplit(memberIds));
  }, [group, memberIds]);

  if (group === undefined) return failed ? <NotFound /> : <RowSkeleton />;

  const save = async (patch: Omit<Parameters<typeof update>[0], "groupId">) => {
    setSaving(true);
    try {
      await update({ groupId, ...patch });
      toast.success("Saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveDefaultSplit = async () => {
    if (!defaultOn) return save({ defaultSplit: null });
    if (!split) return;
    try {
      const spec = toSpec(split, group.lastCurrency ?? "USD");
      if (spec.method === "exact" || spec.method === "adjustment" || spec.method === "reimbursement" || spec.method === "itemized") {
        return toast.error("A default split can be equal, by percentages or by shares.");
      }
      await save({ defaultSplit: spec as never });
    } catch (e) {
      toast.error(typeof e === "string" ? e : errorMessage(e));
    }
  };

  const onCover = async (file: File) => {
    try {
      const url = await uploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await save({ coverId: storageId });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const notMembers = (friends ?? []).filter((f) => !memberIds.includes(f.user._id));

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link to={`/groups/${groupId}`}>
          <ArrowLeft /> {group.name}
        </Link>
      </Button>
      <PageHeader title="Group settings" />
      <GroupNav groupId={groupId} current="settings" />
      <div className="space-y-5">
        <Section title="About">
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-4">
              <GroupAvatar group={{ ...group, name }} size="xl" />
              <div className="space-x-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void onCover(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Upload cover
                </Button>
                {group.coverUrl ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => save({ coverId: null })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <Field label="Name" htmlFor="gname">
              <Input id="gname" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== group.name && save({ name })} />
            </Field>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Type</div>
              <RadioGroup
                value={type}
                onValueChange={(v) => {
                  setType(v as GroupType);
                  void save({ type: v as GroupType });
                }}
                className="grid grid-cols-4 gap-2"
              >
                {(Object.keys(GROUP_TYPE_LABELS) as GroupType[]).map((t) => (
                  <label key={t} className="pressable shadow-ring hover:bg-surface-2 has-data-[state=checked]:bg-brand-soft has-data-[state=checked]:text-brand-ink has-data-[state=checked]:shadow-[0_0_0_1px_var(--brand)] flex cursor-pointer items-center justify-center rounded-[10px] px-2 py-2 text-sm font-medium">
                    <RadioGroupItem value={t} className="sr-only" />
                    {GROUP_TYPE_LABELS[t]}
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
        </Section>

        <Section title="Members">
          <ul className="divide-y">
            {group.members.map((m) => (
              <li key={m._id} className="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar user={m} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.name} {m._id === me?._id ? <span className="text-text-faint font-normal">(you)</span> : null}
                  </div>
                  <div className="text-text-faint truncate text-xs">{m.isPlaceholder ? "Hasn't joined yet" : m.email}</div>
                </div>
                <BalanceSummary balances={group.memberNets[m._id] ?? {}} compact className="text-xs" />
                {group.members.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m._id === me?._id ? "Leave group" : `Remove ${m.name}`}
                    title={m._id === me?._id ? "Leave group" : "Remove from group"}
                    onClick={async () => {
                      try {
                        await removeMember({ groupId, userId: m._id });
                        if (m._id === me?._id) {
                          toast.success("You left the group");
                          navigate("/dashboard");
                        } else toast.success(`${m.name} removed`);
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  >
                    <UserMinus />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t p-4">
            {notMembers.length > 0 ? (
              <div className="flex gap-2">
                <Select value={pickFriend} onValueChange={setPickFriend}>
                  <SelectTrigger className="flex-1" aria-label="Add a friend">
                    <SelectValue placeholder="Add an existing friend" />
                  </SelectTrigger>
                  <SelectContent>
                    {notMembers.map((f) => (
                      <SelectItem key={f.user._id} value={f.user._id}>
                        {f.user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  disabled={!pickFriend}
                  onClick={async () => {
                    try {
                      await addMember({ groupId, member: { userId: pickFriend as Id<"users"> } });
                      setPickFriend("");
                      toast.success("Member added");
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <UserPlus /> Add
                </Button>
              </div>
            ) : null}
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await addMember({ groupId, member: { name: newName || undefined, email: newEmail || undefined } });
                  setNewName("");
                  setNewEmail("");
                  toast.success("Member added");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Input placeholder="Name" aria-label="New member name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Email (optional)" type="email" aria-label="New member email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!newName.trim() && !newEmail.trim()}>
                <UserPlus /> Invite
              </Button>
            </form>
            <p className="text-text-faint text-xs">Members can only be removed once they're settled up in this group.</p>
          </div>
        </Section>

        <Section title="Balances">
          <label className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>
              <span className="font-medium">Simplify debts</span>
              <span className="text-text-muted block text-xs">Reshuffles who pays whom so fewer payments settle everyone. Totals never change. Anyone in the group can switch this.</span>
            </span>
            <Switch checked={group.simplifyDebts} onCheckedChange={(v) => save({ simplifyDebts: v })} disabled={saving} />
          </label>
          <div className="border-t p-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Default split</span>
                <span className="text-text-muted block text-xs">New expenses in this group start with this split instead of equal.</span>
              </span>
              <Switch checked={defaultOn} onCheckedChange={(v) => { setDefaultOn(v); if (!v) void save({ defaultSplit: null }); }} />
            </label>
            {defaultOn && split ? (
              <div className="mt-3 space-y-3">
                <SplitEditor state={{ ...split, method: split.method === "equal" || split.method === "percent" || split.method === "shares" ? split.method : "equal" }} onChange={setSplit} people={group.members} currency={group.lastCurrency ?? "USD"} totalMinor={null} preview={null} />
                <Button size="sm" onClick={() => void saveDefaultSplit()} disabled={saving}>
                  Save default split
                </Button>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Whiteboard">
          <div className="space-y-2 p-4">
            <Textarea rows={4} maxLength={5000} placeholder="Notes for everyone in the group: the address, the wifi password, who's bringing what…" value={whiteboard} onChange={(e) => setWhiteboard(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={saving || whiteboard === group.whiteboard} onClick={() => save({ whiteboard })}>
              Save whiteboard
            </Button>
          </div>
        </Section>

        <Section title="Invite link">
          <div className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <code className="bg-surface min-w-0 flex-1 truncate rounded px-2 py-1 text-xs">{`${window.location.origin}/join/${group.inviteCode}`}</code>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/join/${group.inviteCode}`); toast.success("Link copied"); }}>
              <Copy /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => regenerate({ groupId }).then(() => toast.success("New link created. The old one no longer works."))}>
              <X /> Reset link
            </Button>
          </div>
        </Section>

        <Section title="Danger zone">
          <div className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>
              <span className="font-medium">Delete this group</span>
              <span className="text-text-muted block text-xs">Its expenses stop counting toward balances. Anyone in it can restore it from Deleted items.</span>
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Delete group
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{group.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>Everyone in the group loses these balances until someone restores it.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await remove({ groupId });
                        toast.success("Group deleted");
                        navigate("/dashboard");
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Section>
      </div>
    </div>
  );
}
