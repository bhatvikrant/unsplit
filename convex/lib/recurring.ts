import { addMonths, addWeeks, addYears } from "date-fns";

export type RepeatInterval = "never" | "weekly" | "fortnightly" | "monthly" | "yearly";

export function nextOccurrence(dateMs: number, interval: RepeatInterval): number | undefined {
  const d = new Date(dateMs);
  switch (interval) {
    case "weekly": return addWeeks(d, 1).getTime();
    case "fortnightly": return addWeeks(d, 2).getTime();
    case "monthly": return addMonths(d, 1).getTime();
    case "yearly": return addYears(d, 1).getTime();
    default: return undefined;
  }
}

export const REPEAT_LABELS: Record<RepeatInterval, string> = {
  never: "Doesn't repeat",
  weekly: "Every week",
  fortnightly: "Every two weeks",
  monthly: "Every month",
  yearly: "Every year",
};
