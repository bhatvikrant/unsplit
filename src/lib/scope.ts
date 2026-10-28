/**
 * The group or friend an expense was last added to, so the next add-expense form (from the
 * dashboard, or handed over by UnMoney) starts on it instead of an empty "With" picker.
 */
export type ScopeRef = { kind: "group" | "friend"; id: string };

const KEY = "unsplit.lastScope";

export function rememberScope(scope: ScopeRef): void {
  try {
    localStorage.setItem(KEY, `${scope.kind}:${scope.id}`);
  } catch {
    /* storage off: the picker just starts empty next time */
  }
}

export function lastScope(): ScopeRef | null {
  try {
    const raw = localStorage.getItem(KEY);
    const m = raw && /^(group|friend):(.+)$/.exec(raw);
    return m ? { kind: m[1] as ScopeRef["kind"], id: m[2] } : null;
  } catch {
    return null;
  }
}

/**
 * Where a new expense should start: the remembered scope when it still exists, else the only
 * group or friend there is, else nothing.
 */
export function defaultScope(groupIds: string[], friendIds: string[]): ScopeRef | null {
  const last = lastScope();
  if (last && (last.kind === "group" ? groupIds : friendIds).includes(last.id)) return last;
  if (groupIds.length + friendIds.length === 1) return groupIds.length ? { kind: "group", id: groupIds[0] } : { kind: "friend", id: friendIds[0] };
  return null;
}
