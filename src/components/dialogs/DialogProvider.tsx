import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { warm } from "@/lib/lazy";
import type { AddExpenseOptions } from "./AddExpenseDialog";
import type { SettleUpOptions } from "./SettleUpDialog";
import type { ConvertOptions } from "./ConvertCurrencyDialog";

// The dialogs' code (forms, pickers, the date picker) is not in the app shell's chunk: it is fetched
// once the shell is idle, or on first open if that comes sooner (see lib/lazy.ts).
const AddExpenseDialog = lazy(warm(() => import("./AddExpenseDialog").then((x) => ({ default: x.AddExpenseDialog }))));
const SettleUpDialog = lazy(warm(() => import("./SettleUpDialog").then((x) => ({ default: x.SettleUpDialog }))));
const CreateGroupDialog = lazy(warm(() => import("./CreateGroupDialog").then((x) => ({ default: x.CreateGroupDialog }))));
const AddFriendDialog = lazy(warm(() => import("./AddFriendDialog").then((x) => ({ default: x.AddFriendDialog }))));
const ConvertCurrencyDialog = lazy(warm(() => import("./ConvertCurrencyDialog").then((x) => ({ default: x.ConvertCurrencyDialog }))));

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
      {/* Nothing shows while a chunk loads; the dialog then opens with its usual animation. */}
      <Suspense fallback={null}>
        {expense ? <AddExpenseDialog key={expense.key} options={expense.opts} onClose={closeExpense} /> : null}
        {settle ? <SettleUpDialog key={settle.key} options={settle.opts} onClose={() => setSettle(null)} /> : null}
        {group ? <CreateGroupDialog key={group} onClose={() => setGroup(null)} /> : null}
        {friend ? <AddFriendDialog key={friend} onClose={() => setFriend(null)} /> : null}
        {convert ? <ConvertCurrencyDialog key={convert.key} options={convert.opts} onClose={() => setConvert(null)} /> : null}
      </Suspense>
    </Ctx.Provider>
  );
}

export type { Id };
