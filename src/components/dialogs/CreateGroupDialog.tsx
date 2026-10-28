import { useQuery } from "@/lib/convex";
import { useNavigate } from "react-router";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { GroupFormFields, useGroupForm } from "./GroupForm";

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const friends = useQuery(api.friends.list);
  const navigate = useNavigate();
  const form = useGroupForm({
    onCreated: (id) => {
      onClose();
      navigate(`/groups/${id}`);
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        size="full"
        action={{ label: form.busy ? "Creating…" : "Create", onClick: () => void form.submit(), disabled: !form.canSubmit }}
      >
        <DialogHeader>
          <DialogTitle>Start a group</DialogTitle>
          <DialogDescription>A place for expenses a set of people share.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <GroupFormFields form={form} friends={friends} />
        </div>
        <DialogFooter className="mt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!form.canSubmit} onClick={() => void form.submit()}>
            {form.busy ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
