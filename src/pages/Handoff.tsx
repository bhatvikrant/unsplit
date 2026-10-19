import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";
import { parseHandoff, stashHandoff } from "@/lib/handoff";

/**
 * /expenses/new#unmoney=…: where UnMoney sends entries to be split. The payload is put aside and
 * the dashboard opens the add-expense form from it (AppShell), after the sign-in if there is one.
 */
export function HandoffLanding() {
  const { hash } = useLocation();
  // read and stashed before anything navigates, once
  const [ok] = useState(() => {
    const h = parseHandoff(hash);
    if (h) stashHandoff(h);
    else toast.error("Couldn't read the expense UnMoney sent over");
    return Boolean(h);
  });
  void ok;
  return <Navigate to="/dashboard" replace />;
}
