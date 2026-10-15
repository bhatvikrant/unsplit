import { useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserAvatar, GROUP_TYPE_LABELS } from "@/components/common/Avatars";
import { Field } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/format";

type GroupType = "home" | "trip" | "couple" | "other";

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.groups.create);
  const friends = useQuery(api.friends.list);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<GroupType>("trip");
  const [simplify, setSimplify] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [newPeople, setNewPeople] = useState<{ name: string; email: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const members = [
        ...Object.entries(picked).filter(([, v]) => v).map(([id]) => ({ userId: id as Id<"users"> })),
        ...newPeople.filter((p) => p.name.trim() || p.email.trim()).map((p) => ({ name: p.name.trim() || undefined, email: p.email.trim() || undefined })),
      ];
      const id = await create({ name, type, members, simplifyDebts: simplify });
      toast.success("Group created");
      onClose();
      navigate(`/groups/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Start a group</DialogTitle>
            <DialogDescription>A place for expenses a set of people share.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <Field label="Group name" htmlFor="gname" error={error}>
              <Input id="gname" autoFocus required maxLength={80} placeholder="Lisbon trip, Flat 4B, …" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Type</div>
              <RadioGroup value={type} onValueChange={(v) => setType(v as GroupType)} className="grid grid-cols-4 gap-2">
                {(Object.keys(GROUP_TYPE_LABELS) as GroupType[]).map((t) => (
                  <label key={t} className="pressable shadow-ring hover:bg-surface-2 has-data-[state=checked]:bg-brand-soft has-data-[state=checked]:text-brand-ink has-data-[state=checked]:shadow-[0_0_0_1px_var(--brand)] flex cursor-pointer items-center justify-center gap-2 rounded-[10px] px-2 py-2 text-sm font-medium">
                    <RadioGroupItem value={t} className="sr-only" />
                    {GROUP_TYPE_LABELS[t]}
                  </label>
                ))}
              </RadioGroup>
            </div>
            {friends && friends.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Add friends</div>
                <div className="shadow-ring max-h-40 space-y-1 overflow-y-auto rounded-xl p-1.5">
                  {friends.map((f) => (
                    <label key={f.user._id} className="hover:bg-surface flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm">
                      <Checkbox checked={Boolean(picked[f.user._id])} onCheckedChange={(v) => setPicked((p) => ({ ...p, [f.user._id]: Boolean(v) }))} />
                      <UserAvatar user={f.user} size="xs" />
                      <span className="truncate">{f.user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Invite new people</div>
              {newPeople.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Name" aria-label="Name" value={p.name} onChange={(e) => setNewPeople((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input placeholder="Email (optional)" aria-label="Email" type="email" value={p.email} onChange={(e) => setNewPeople((xs) => xs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setNewPeople((xs) => xs.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setNewPeople((xs) => [...xs, { name: "", email: "" }])}>
                <Plus /> Add a person
              </Button>
              <p className="text-text-faint text-xs">People without an email get a placeholder. When they sign up with that email later, it's theirs.</p>
            </div>
            <label className="shadow-ring flex items-center justify-between gap-3 rounded-xl p-3 text-sm">
              <span>
                <span className="font-medium">Simplify debts</span>
                <span className="text-text-muted block text-xs">Fewer payments to settle everyone up. Can be changed later.</span>
              </span>
              <Switch checked={simplify} onCheckedChange={setSimplify} />
            </label>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
