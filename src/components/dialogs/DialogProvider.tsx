import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";
import type { AddExpenseOptions } from "./AddExpenseDialog";
import type { SettleUpOptions } from "./SettleUpDialog";
import type { ConvertOptions } from "./ConvertCurrencyDialog";

/**
 * The dialogs (the expense form above all, with its date and split pickers) are not needed until
 * one is opened, so they stay out of the dashboard's first load. preloadDialogs() fetches them in
 * the background once the app is up (AppShell), so a tap opens one at once, offline included.
 */
const loaders = {
  addExpense: () => import("./AddExpenseDialog"),
  settleUp: () => import("./SettleUpDialog"),
  createGroup: () => import("./CreateGroupDialog"),
  addFriend: () => import("./AddFriendDialog"),
  convert: () => import("./ConvertCurrencyDialog"),
};
const AddExpenseDialog = lazy(() => loaders.addExpense().then((m) => ({ default: m.AddExpenseDialog })));
const SettleUpDialog = lazy(() => loaders.settleUp().then((m) => ({ default: m.SettleUpDialog })));
const CreateGroupDialog = lazy(() => loaders.createGroup().then((m) => ({ default: m.CreateGroupDialog })));
const AddFriendDialog = lazy(() => loaders.addFriend().then((m) => ({ default: m.AddFriendDialog })));
const ConvertCurrencyDialog = lazy(() => loaders.convert().then((m) => ({ default: m.ConvertCurrencyDialog })));

/** Fetches every dialog's chunk ahead of use. Safe to call more than once: imports are cached. */
export function preloadDialogs() {
  for (const load of Object.values(loaders)) void load().catch(() => {});
}

type Dialogs = {
  addExpense: (opts?: AddExpenseOptions) => void;
  settleUp: (opts?: SettleUpOptions) => void;
  createGroup: () => void;
  addFriend: () => void;
  convertCurrency: (opts: ConvertOptions) => void;
};

const Ctx = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDialogs must be used inside DialogProvider");
  return d;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [expense, setExpense] = useState<{ key: number; opts: AddExpenseOptions } | null>(null);
  const [settle, setSettle] = useState<{ key: number; opts: SettleUpOptions } | null>(null);
  const [group, setGroup] = useState<number | null>(null);
  const [friend, setFriend] = useState<number | null>(null);
  const [convert, setConvert] = useState<{ key: number; opts: ConvertOptions } | null>(null);

  const api = useMemo<Dialogs>(
    () => ({
      addExpense: (opts = {}) => setExpense({ key: Date.now(), opts }),
      settleUp: (opts = {}) => setSettle({ key: Date.now(), opts }),
      createGroup: () => setGroup(Date.now()),
      addFriend: () => setFriend(Date.now()),
      convertCurrency: (opts) => setConvert({ key: Date.now(), opts }),
    }),
    [],
  );
  const closeExpense = useCallback(() => setExpense(null), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Nothing stands in while a dialog's chunk arrives: it is preloaded, so that is a moment at
          most. One boundary each, so opening one never hides another that is already open. */}
      {expense ? <Suspense fallback={null}><AddExpenseDialog key={expense.key} options={expense.opts} onClose={closeExpense} /></Suspense> : null}
      {settle ? <Suspense fallback={null}><SettleUpDialog key={settle.key} options={settle.opts} onClose={() => setSettle(null)} /></Suspense> : null}
      {group ? <Suspense fallback={null}><CreateGroupDialog key={group} onClose={() => setGroup(null)} /></Suspense> : null}
      {friend ? <Suspense fallback={null}><AddFriendDialog key={friend} onClose={() => setFriend(null)} /></Suspense> : null}
      {convert ? <Suspense fallback={null}><ConvertCurrencyDialog key={convert.key} options={convert.opts} onClose={() => setConvert(null)} /></Suspense> : null}
    </Ctx.Provider>
  );
}

export type { Id };
