/**
 * The "all settled" moment. Recording a payment that clears a balance calls `markSettled()` (and
 * plays the bell itself); a settled-up line that appears within a few seconds after that gives its
 * bell one wobble (components/common/SettledBell.tsx). Lines that were already settled stay still.
 */
let settledAt = 0;
const WINDOW_MS = 8000;

export function markSettled() {
  settledAt = Date.now();
}

export function justSettled(): boolean {
  return Date.now() - settledAt < WINDOW_MS;
}
