import { useMemo } from "react";
import { useMatch } from "react-router";
import type { Id } from "@convex/_generated/dataModel";
import { useDialogs } from "@/components/dialogs/DialogProvider";

/**
 * The two actions people reach for most, aware of where they are: on a group or
 * friend page they start in that context, elsewhere they start blank.
 */
export function useQuickActions() {
  const dialogs = useDialogs();
  const group = useMatch("/groups/:id/*");
  const friend = useMatch("/friends/:id");
  const groupId = group?.params.id as Id<"groups"> | undefined;
  const friendId = friend?.params.id as Id<"users"> | undefined;
  return useMemo(
    () => ({
      addExpense: () => {
        if (groupId) dialogs.addExpense({ groupId });
        else if (friendId) dialogs.addExpense({ friendId });
        else dialogs.addExpense();
      },
      settleUp: () => {
        if (groupId) dialogs.settleUp({ groupId });
        else if (friendId) dialogs.settleUp({ friendId });
        else dialogs.settleUp();
      },
    }),
    [dialogs, groupId, friendId],
  );
}
