import { describe, expect, it } from "vitest";
import { formatDate, monthShort, relativeTime } from "@/lib/format";

const thisYear = new Date().getFullYear();
const at = (y: number, m: number, d: number, h = 15, min = 14) => new Date(y, m - 1, d, h, min).getTime();

describe("formatDate", () => {
  it("reads day first", () => {
    expect(formatDate(at(thisYear, 10, 19))).toBe("19 Oct");
    expect(formatDate(at(2024, 10, 19))).toBe("19 Oct 2024");
    expect(formatDate(at(2026, 10, 19), "monthDay")).toBe("19 Oct");
    expect(formatDate(at(2026, 10, 19), "long")).toBe("Monday, 19 October 2026");
    expect(formatDate(at(2026, 10, 19), "weekday")).toBe("Monday, 19 October");
    expect(formatDate(at(2026, 10, 19), "time")).toBe("19 Oct 2026 at 3:14 PM");
  });
  it("gives the short month for list labels", () => {
    expect(monthShort(at(2026, 10, 19))).toBe("Oct");
    expect(monthShort(at(2026, 1, 2))).toBe("Jan");
  });
});

describe("relativeTime", () => {
  it("is relative today and day-first otherwise", () => {
    expect(relativeTime(Date.now() - 5 * 60_000)).toMatch(/ago$/);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(9, 5, 0, 0);
    expect(relativeTime(y.getTime())).toBe("Yesterday at 9:05 AM");
    expect(relativeTime(at(2024, 3, 7))).toBe("7 Mar 2024");
  });
});
