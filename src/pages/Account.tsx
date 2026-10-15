import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useMutation, useRequireOnline } from "@/lib/convex";
import { Download, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserAvatar } from "@/components/common/Avatars";
import { Field, PageHeader, RowSkeleton, Section } from "@/components/common/Misc";
import { CurrencyPicker } from "@/components/dialogs/pickers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { downloadFile, errorMessage } from "@/lib/format";
import { useMe } from "@/lib/hooks";

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
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const loaded = useRef(false);
  useEffect(() => {
    if (me && !loaded.current) {
      loaded.current = true;
      setName(me.name);
    }
  }, [me]);
  if (!me) return <RowSkeleton />;

  const save = (patch: Parameters<typeof update>[0]) => update(patch).then(() => toast.success("Saved")).catch((e) => toast.error(errorMessage(e)));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Account" actions={<Button variant="outline" asChild><Link to="/account/notifications">Email notifications</Link></Button>} />
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
                    const url = await uploadUrl();
                    const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
                    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
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
                <Button variant="ghost" size="sm" onClick={() => save({ avatarId: null })}>
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
      <Section title="Preferences">
        <div className="space-y-4 p-4">
          <Field label="Default currency" hint="New expenses start in this currency, and totals are shown in it where possible.">
            <CurrencyPicker value={me.defaultCurrency} onChange={(c) => save({ defaultCurrency: c })} />
          </Field>
          <Field label="Time zone" hint={`Your browser reports ${browserTz}.`}>
            <Select value={me.timeZone ?? browserTz} onValueChange={(v) => save({ timeZone: v })}>
              <SelectTrigger className="w-full max-w-xs" aria-label="Time zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(TIME_ZONES.length ? TIME_ZONES : [browserTz]).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              await signOutEverywhere();
              await signOut();
              navigate("/");
            }}
          >
            <LogOut /> Log out of all devices
          </Button>
        </div>
      </Section>
      <Section title="Danger zone">
        <div className="flex items-center justify-between gap-3 p-4 text-sm">
          <span>
            <span className="font-medium">Delete account</span>
            <span className="text-text-muted block text-xs">You need to be settled up with everyone first. Your name is removed from shared expenses, but the expenses stay so other people's balances stay correct. See the <Link to="/privacy" className="underline">privacy page</Link>.</span>
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone. You'll be signed out and your login removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my account</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await deleteAccount();
                      await signOut();
                      navigate("/");
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
      <PageHeader title="Email notifications" subtitle="Emails only go out when the deployment has an email provider configured." />
      <Section>
        <ul className="divide-y">
          {PREFS.map((p) => (
            <li key={p.key}>
              <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{p.label}</span>
                  {p.hint ? <span className="text-text-muted block text-xs">{p.hint}</span> : null}
                </span>
                <Switch checked={prefs[p.key]} onCheckedChange={(v) => update({ notifPrefs: { ...prefs, [p.key]: v } }).catch((e) => toast.error(errorMessage(e)))} />
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
