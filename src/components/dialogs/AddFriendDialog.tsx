import { useMutation } from "@/lib/convex";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Field } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";

export function AddFriendDialog({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.friends.add);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await add({ name: name || undefined, email: email || undefined });
      toast.success(res.alreadyFriends ? "You're already friends" : "Friend added");
      onClose();
      navigate(`/friends/${res.friendId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a friend</DialogTitle>
            <DialogDescription>Share expenses with someone outside a group.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <Field label="Name" htmlFor="fname">
              <Input id="fname" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="femail" hint="Optional. If they already use UnSplit, this links to their account; if not, they get an invite." error={error}>
              <Input id="femail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (!name.trim() && !email.trim())}>
              {busy ? "Adding…" : "Add friend"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
