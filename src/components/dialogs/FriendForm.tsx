import { useMutation } from "@/lib/convex";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field } from "@/components/common/Misc";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";
import { submitOnEnter } from "./GroupForm";

/**
 * The "add a friend" form, shared by AddFriendDialog and the add-expense form (where the new
 * friend becomes the expense's scope). Same shape as useGroupForm / GroupFormFields.
 */
export function useFriendForm({ onAdded }: { onAdded: (id: Id<"users">, alreadyFriends: boolean) => void }) {
  const add = useMutation(api.friends.add);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = !busy && (name.trim().length > 0 || email.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await add({ name: name || undefined, email: email || undefined });
      if (res.alreadyFriends) toast("You're already friends");
      onAdded(res.friendId, res.alreadyFriends);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return { name, setName, email, setEmail, busy, error, canSubmit, submit };
}
export type FriendForm = ReturnType<typeof useFriendForm>;

export function FriendFormFields({ form, idPrefix = "f" }: { form: FriendForm; idPrefix?: string }) {
  const { name, setName, email, setEmail, error } = form;
  return (
    <div className="space-y-3" onKeyDown={submitOnEnter(() => void form.submit())}>
      <Field label="Name" htmlFor={`${idPrefix}name`}>
        <Input id={`${idPrefix}name`} autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor={`${idPrefix}email`} hint="Optional. If they already use UnSplit, this links to their account; if not, they get an invite." error={error}>
        <Input id={`${idPrefix}email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
    </div>
  );
}
