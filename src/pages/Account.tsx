import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useMutation, useRequireOnline } from "@/lib/convex";
import { BarChart3, ChevronRight, Download, LogOut, Mail, Repeat, Trash2, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { UserAvatar } from "@/components/common/Avatars";
import { Field, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { InstallSection } from "@/components/layout/InstallPrompt";
import { useLogOut } from "@/components/layout/UserMenu";
import { CurrencyPicker } from "@/components/dialogs/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Picker, PickerItem } from "@/components/ui/picker";
import { Switch } from "@/components/ui/switch";
import { downloadFile, errorMessage } from "@/lib/format";
import { AVATAR_EDGE, uploadImage } from "@/lib/image";
import { useMe } from "@/lib/hooks";
import { useConfirm } from "@/components/common/ConfirmDialog";

const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

export function AccountPage() {
  const me = useMe();
  const update = useMutation(api.users.update);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const signOutEverywhere = useMutation(api.users.signOutEverywhere);
  const uploadUrl = useMutation(api.files.generateUploadUrl);
  const { signOut } = useAuthActions();
  const convex = useConvex();
  const requireOnline = useRequireOnline();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const loaded = useRef(false);
  useLayoutEffect(() => {
    if (me && !loaded.current) {
      loaded.current = true;
      setName(me.name);
    }
  }, [me]);
  if (!me) return <RowSkeleton />;

  const save = (patch: Parameters<typeof update>[0]) => update(patch).catch((e) => toast.error(errorMessage(e)));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Account" actions={<Button variant="outline" asChild className="max-lg:hidden"><Link to="/account/notifications">Email notifications</Link></Button>} />
      <Section title="Profile">
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <UserAvatar user={me} size="xl" />
            <div className="space-x-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const { storageId } = await uploadImage(uploadUrl, f, AVATAR_EDGE);
                    await save({ avatarId: storageId });
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Change photo
              </Button>
              {me.image ? (
                <Button variant="ghost" size="sm" onClick={async () => (await confirm({ title: "Remove your photo?", description: "A generated avatar takes its place.", action: "Remove" })) && save({ avatarId: null })}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== me.name && save({ name })} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Your email is how friends find you. It can't be changed here yet.">
            <Input id="email" value={me.email ?? ""} readOnly className="bg-surface" />
          </Field>
        </div>
      </Section>
      <InstallSection />
      <Section title="Preferences">
        <div className="space-y-4 p-4">
          <Field label="Default currency" hint="New expenses start in this currency, and totals are shown in it where possible.">
            <CurrencyPicker value={me.defaultCurrency} onChange={(c) => save({ defaultCurrency: c })} />
          </Field>
          <Field label="Time zone" hint={`Your browser reports ${browserTz}.`}>
            <Picker value={me.timeZone ?? browserTz} onValueChange={(v) => save({ timeZone: v })} aria-label="Time zone" searchable searchPlaceholder="Search time zones" className="w-full max-w-xs">
              {(TIME_ZONES.length ? TIME_ZONES : [browserTz]).map((tz) => (
                <PickerItem key={tz} value={tz}>
                  {tz}
                </PickerItem>
              ))}
            </Picker>
          </Field>
        </div>
      </Section>
      <Section title="Your data">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                requireOnline();
                const data = await convex.query(api.exports.json, {});
                downloadFile(`unsplit-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Download /> Download JSON backup
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!(await confirm({ title: "Log out of all devices?", description: "Every device signed in to UnSplit, including this one, has to sign in again.", action: "Log out everywhere", destructive: false }))) return;
              try {
                await signOutEverywhere();
                await signOut();
                navigate("/");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <LogOut /> Log out of all devices
          </Button>
        </div>
      </Section>
      <MoreSection />
      <Section title="Danger zone">
        <div className="flex items-center justify-between gap-3 p-4 text-sm">
          <span>
            <span className="font-medium">Delete account</span>
            <span className="text-text-muted block text-xs">You need to be settled up with everyone first. Your name is removed from shared expenses, but the expenses stay so other people's balances stay correct. See the <Link to="/privacy" className="underline">privacy page</Link>.</span>
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!(await confirm({ title: "Delete your account?", description: "This can't be undone. You'll be signed out and your login removed.", action: "Delete account" }))) return;
              try {
                await deleteAccount();
                await signOut();
                navigate("/");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            Delete account
          </Button>
        </div>
      </Section>
    </div>
  );
}

const MORE: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/account/notifications", label: "Email notifications", icon: Mail },
  { to: "/charts", label: "Spending charts", icon: BarChart3 },
  { to: "/expenses/recurring", label: "Recurring expenses", icon: Repeat },
  { to: "/trash", label: "Deleted items", icon: Trash2 },
];

/** Phones and tablets have no sidebar or user menu, so the account-level pages and Log out live here. */
function MoreSection() {
  const logOut = useLogOut();
  return (
    <Section className="lg:hidden">
      <ul className="divide-y">
        {MORE.map((m) => (
          <li key={m.to}>
            <Link to={m.to} className="hover:bg-surface-2 active:bg-surface-2 flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm font-medium outline-none transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring">
              <m.icon className="text-text-muted size-4" />
              <span className="flex-1">{m.label}</span>
              <ChevronRight className="text-text-faint size-4" />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => void logOut()} className="hover:bg-surface-2 active:bg-surface-2 text-negative flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium outline-none transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring">
            <LogOut className="size-4" />
            <span className="flex-1">Log out</span>
          </button>
        </li>
      </ul>
    </Section>
  );
}

const PREFS: { key: keyof NonNullable<ReturnType<typeof useMe>>["notifPrefs"]; label: string; hint: string }[] = [
  { key: "expenseAdded", label: "An expense is added", hint: "Someone adds an expense you're part of." },
  { key: "expenseUpdated", label: "An expense is edited or deleted", hint: "Something you're part of changes." },
  { key: "commentAdded", label: "Someone comments", hint: "On an expense you're part of." },
  { key: "paymentRecorded", label: "A payment is recorded", hint: "Someone records paying you, or being paid by you." },
  { key: "addedToGroup", label: "You're added to a group", hint: "Or a group you're in is deleted." },
  { key: "friendAdded", label: "Someone adds you as a friend", hint: "" },
  { key: "reminders", label: "Reminders", hint: "The day before a recurring expense posts, when its reminder is on." },
  { key: "monthlySummary", label: "Monthly summary", hint: "A recap of what you spent and what's outstanding." },
];

export function NotificationSettings() {
  const me = useMe();
  const update = useMutation(api.users.update);
  if (!me) return <RowSkeleton />;
  const prefs = me.notifPrefs;
  return (
    <div className="max-w-2xl">
      <PageHeader back={{ to: "/account", label: "Account" }} title="Email notifications" subtitle="Emails only go out when the deployment has an email provider configured." />
      <Section>
        <ul className="divide-y">
          {PREFS.map((p) => (
            <li key={p.key}>
              <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{p.label}</span>
                  {p.hint ? <span className="text-text-muted block text-xs">{p.hint}</span> : null}
                </span>
                <Switch size="touch" checked={prefs[p.key]} onCheckedChange={(v) => update({ notifPrefs: { ...prefs, [p.key]: v } }).catch((e) => toast.error(errorMessage(e)))} />
              </label>
            </li>
          ))}
        </ul>
      </Section>
      <Button variant="ghost" size="sm" className="mt-4" asChild>
        <Link to="/account">Back to account</Link>
      </Button>
    </div>
  );
}
