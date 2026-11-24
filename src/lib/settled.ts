/**
 * The "all settled" moment. Recording a payment that clears a balance calls `markSettled(at)` with
 * the time its sheet will close (and plays the bell itself then); a settled-up line that shows within
 * a few seconds of that gives its bell one wobble at that time (components/common/SettledBell.tsx),
 * so it isn't spent behind the sheet. The balance updates optimistically, so the line can appear
 * before the save finishes: that is why the mark comes first. Lines that were already settled stay still.
 */
let settledAt = 0;
const WINDOW_MS = 8000;

export function markSettled(at = Date.now()) {
  settledAt = at;
}

/** The save failed: nothing was settled after all. */
export function clearSettled() {
  settledAt = 0;
}

/** Milliseconds until a fresh settled-up bell should wobble, or null if nothing was just settled. */
export function settledBellDelay(): number | null {
  const d = settledAt - Date.now();
  return d < -WINDOW_MS ? null : Math.max(0, d);
}
