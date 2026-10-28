import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FriendFormFields, useFriendForm } from "./FriendForm";

export function AddFriendDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const form = useFriendForm({
    onAdded: (id) => {
      onClose();
      navigate(`/friends/${id}`);
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a friend</DialogTitle>
          <DialogDescription>Share expenses with someone outside a group.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <FriendFormFields form={form} />
        </div>
        <DialogFooter className="mt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!form.canSubmit} onClick={() => void form.submit()}>
            {form.busy ? "Adding…" : "Add friend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
