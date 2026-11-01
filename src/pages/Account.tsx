import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useMutation, useOfflineStatus, useRequireOnline } from "@/lib/convex";
import {
  BarChart3,
  ChevronRight,
  CloudCheck,
  CloudOff,
  Coins,
  Download,
  ExternalLink,
  HardDriveDownload,
  LoaderCircle,
  LogOut,
  Mail,
  MonitorSmartphone,
  Repeat,
  Smartphone,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { UserAvatar } from "@/components/common/Avatars";
import { Field, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { InstallButton } from "@/components/layout/InstallPrompt";
import { useLogOut } from "@/components/layout/UserMenu";
import { CurrencyPicker } from "@/components/dialogs/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Picker, PickerItem } from "@/components/ui/picker";
import { Switch } from "@/components/ui/switch";
import { downloadFile, errorMessage } from "@/lib/format";
import { UNMONEY_URL } from "@/lib/handoff";
import { AVATAR_EDGE, uploadImage } from "@/lib/image";
import { useMe } from "@/lib/hooks";
import { useInstall } from "@/lib/install";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/common/ConfirmDialog";

/** When this build was made (vite.config.ts), or "dev" on a dev server. */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

const BACK = { to: "/account", label: "More" };

const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

/* ---------- menu building blocks ---------- */

/** A titled group of menu rows. */
function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title ? <h2 className="text-text-muted px-4 pb-1.5 text-xs font-semibold tracking-wide uppercase">{title}</h2> : null}
      <div className="card divide-y overflow-hidden">{children}</div>
    </section>
  );
}

const rowClass = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left";
const pressClass = "hover:bg-surface-2 active:bg-surface-2 outline-none transition-colors duration-100 focus-visible:bg-surface-2";

function RowBody({ icon, label, hint, value, right, tone }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; value?: ReactNode; right?: ReactNode; tone?: "danger" }) {
  return (
    <>
      {icon ? (
        <span className={cn("bg-surface-2 text-text flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", tone === "danger" && "text-negative")}>{icon}</span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn("text-text block text-sm font-medium", tone === "danger" && "text-negative")}>{label}</span>
        {hint ? <span className="text-text-muted block text-xs">{hint}</span> : null}
      </span>
      {value !== undefined ? <span className="text-text-muted max-w-[45%] shrink-0 truncate text-sm">{value}</span> : null}
      {right}
    </>
  );
}

type RowProps = { icon?: ReactNode; label: ReactNode; hint?: ReactNode; value?: ReactNode; tone?: "danger" };

/** A row that opens another page. */
function LinkRow({ to, ...body }: RowProps & { to: string }) {
  return (
    <Link to={to} className={cn(rowClass, pressClass)}>
      <RowBody {...body} right={<ChevronRight className="text-text-faint size-4 shrink-0" />} />
    </Link>
  );
}

/** A row that runs an action. */
function ActionRow({ onClick, ...body }: RowProps & { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(rowClass, pressClass)}>
      <RowBody {...body} />
    </button>
  );
}

/** A row with its own control at the right (a button, a switch). */
function StaticRow({ right, ...body }: RowProps & { right?: ReactNode }) {
  return (
    <div className={rowClass}>
      <RowBody {...body} right={right} />
    </div>
  );
}

/** Where this device's copy stands against the server. */
function SyncLine() {
  const { offline, syncing, pending, lastError } = useOfflineStatus();
  const waiting = `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
  const [Icon, text, tone] = offline
    ? [CloudOff, pending ? `Offline · ${waiting}` : "Offline · changes save on this device", "text-text-muted"]
    : syncing || pending
      ? [LoaderCircle, pending ? waiting : "Syncing…", "text-text-muted"]
      : lastError
        ? [CloudOff, lastError, "text-negative"]
        : [CloudCheck, "Synced", "text-positive"];
  return (
    <span className={cn("mt-1 flex items-center gap-1.5 text-xs", tone)} aria-live="polite">
      <Icon className={cn("size-3.5 shrink-0", Icon === LoaderCircle && "animate-spin")} />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

/** "Install app", while UnSplit is not yet running as an installed app and the browser can install it. */
function InstallRow() {
  const { installed, canPrompt, manual } = useInstall();
  if (installed || (!canPrompt && !manual)) return null;
  return (
    <StaticRow
      icon={<Smartphone />}
      label="Install app"
      hint="Opens full screen from your home screen and works offline"
      right={
        <InstallButton size="sm" variant={manual ? "outline" : "default"}>
          {manual ? "How?" : "Install"}
        </InstallButton>
      }
    />
  );
}

/* ---------- the More page ---------- */

/**
 * The More tab: who you are, then a short menu of pages. Each setting lives on its own page so the
 * menu stays scannable on a phone.
 */
export function AccountPage() {
  const me = useMe();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const signOutEverywhere = useMutation(api.users.signOutEverywhere);
  const { signOut } = useAuthActions();
  const logOut = useLogOut();
  const confirm = useConfirm();
  const navigate = useNavigate();
  if (!me) return <RowSkeleton />;

  const prefs = Object.values(me.notifPrefs);
  const notifOn = prefs.filter(Boolean).length;

  return (
    <div className="max-w-2xl space-y-6 pb-6">
      <PageHeader title="More" className="mb-0" />

      <MenuSection>
        <Link to="/account/profile" className={cn("flex items-center gap-3 px-4 py-3", pressClass)}>
          <UserAvatar user={me} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="text-text block truncate text-base font-semibold">{me.name}</span>
            {me.email ? <span className="text-text-muted block truncate text-sm">{me.email}</span> : null}
            <SyncLine />
          </span>
          <ChevronRight className="text-text-faint size-4 shrink-0" />
        </Link>
        <InstallRow />
      </MenuSection>

      <MenuSection title="Settings">
        <LinkRow to="/account/profile" icon={<UserRound />} label="Profile" hint="Name and photo" />
        <LinkRow to="/account/preferences" icon={<Coins />} label="Preferences" hint="Default currency, time zone" value={me.defaultCurrency} />
        <LinkRow to="/account/notifications" icon={<Mail />} label="Email notifications" value={notifOn === 0 ? "Off" : notifOn === prefs.length ? "All on" : `${notifOn} of ${prefs.length} on`} />
      </MenuSection>

      <MenuSection title="Expenses">
        <LinkRow to="/expenses/recurring" icon={<Repeat />} label="Recurring expenses" hint="Rent, subscriptions, anything that repeats" />
        <LinkRow to="/charts" icon={<BarChart3 />} label="Spending charts" hint="Your share by month and category" />
        <LinkRow to="/trash" icon={<Trash2 />} label="Deleted items" hint="Restore expenses, groups and payments" />
      </MenuSection>

      <MenuSection title="Data">
        <LinkRow to="/account/backup" icon={<HardDriveDownload />} label="Backup & export" hint="Everything you're part of, as a file" />
        <a href={UNMONEY_URL} target="_blank" rel="noreferrer" className={cn(rowClass, pressClass)}>
          <RowBody
            icon={<Wallet />}
            label="UnMoney"
            hint="Track your own spending, and send entries here to split"
            right={<ExternalLink className="text-text-faint size-4 shrink-0" />}
          />
        </a>
      </MenuSection>

      <MenuSection title="Account">
        <ActionRow icon={<LogOut />} label="Log out" hint="Your expenses stay on the server" onClick={() => void logOut()} />
        <ActionRow
          icon={<MonitorSmartphone />}
          label="Log out of all devices"
          hint="Every device, this one included, has to sign in again"
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
        />
        <ActionRow
          icon={<Trash2 />}
          tone="danger"
          label="Delete account"
          hint="Settle up with everyone first. Shared expenses stay, without your name."
          onClick={async () => {
            if (
              !(await confirm({
                title: "Delete your account?",
                description: "This can't be undone. Your name is removed from shared expenses, but the expenses stay so other people's balances stay correct. You'll be signed out and your login removed.",
                action: "Delete account",
              }))
            )
              return;
            try {
              await deleteAccount();
              await signOut();
              navigate("/");
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      </MenuSection>

      <footer className="text-text-muted space-y-1 px-4 text-xs">
        <p>UnSplit · works offline and syncs across your devices</p>
        <p>
          <Link to="/privacy" className="hover:text-text underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <p className="tnum">Version {APP_VERSION}</p>
      </footer>
    </div>
  );
}

/* ---------- sub-pages ---------- */

export function ProfileSettings() {
  const me = useMe();
  const update = useMutation(api.users.update);
  const uploadUrl = useMutation(api.files.generateUploadUrl);
  const confirm = useConfirm();
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

  return (
    <div className="max-w-2xl">
      <PageHeader back={BACK} title="Profile" />
      <Section>
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
    </div>
  );
}

export function PreferencesSettings() {
  const me = useMe();
  const update = useMutation(api.users.update);
  if (!me) return <RowSkeleton />;
  const save = (patch: Parameters<typeof update>[0]) => update(patch).catch((e) => toast.error(errorMessage(e)));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="max-w-2xl">
      <PageHeader back={BACK} title="Preferences" />
      <Section>
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
    </div>
  );
}

export function BackupSettings() {
  const convex = useConvex();
  const requireOnline = useRequireOnline();
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader back={BACK} title="Backup & export" />
      <Section>
        <StaticRow
          icon={<Download />}
          label="JSON backup"
          hint="Your profile, groups, friends and every expense and payment you're part of. Needs a connection."
          right={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  requireOnline();
                  const data = await convex.query(api.exports.json, {});
                  downloadFile(`unsplit-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing…" : "Download"}
            </Button>
          }
        />
      </Section>
      <p className="text-text-muted px-1 text-xs">For a spreadsheet, open a group or a friend and choose Export as spreadsheet there: one row per expense, one column per person.</p>
    </div>
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
      <PageHeader back={BACK} title="Email notifications" subtitle="Emails only go out when the deployment has an email provider configured." />
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
    </div>
  );
}
