import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from "date-fns";

export function formatDate(ms: number, style: "short" | "long" | "monthDay" | "time" = "short"): string {
  const d = new Date(ms);
  switch (style) {
    case "long": return format(d, "EEEE, MMMM d, yyyy");
    case "monthDay": return format(d, "MMM d");
    case "time": return format(d, "MMM d, yyyy 'at' h:mm a");
    default: return isThisYear(d) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
  }
}

export function relativeTime(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return formatDistanceToNowStrict(d, { addSuffix: true });
  if (isYesterday(d)) return `Yesterday at ${format(d, "h:mm a")}`;
  return isThisYear(d) ? format(d, "MMM d 'at' h:mm a") : format(d, "MMM d, yyyy");
}

export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.getFullYear() === new Date().getFullYear() ? format(d, "MMMM") : format(d, "MMMM yyyy");
}

export function toDateInputValue(ms: number): string {
  return format(new Date(ms), "yyyy-MM-dd");
}

export function fromDateInputValue(value: string, keepTimeFrom?: number): number {
  const [y, m, d] = value.split("-").map(Number);
  const base = keepTimeFrom ? new Date(keepTimeFrom) : new Date();
  const out = new Date(y, m - 1, d, base.getHours(), base.getMinutes(), 0, 0);
  return out.getTime();
}

export function downloadFile(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "data" in e && typeof (e as { data: unknown }).data === "string") return (e as { data: string }).data;
  if (e instanceof Error) {
    const m = e.message.match(/Uncaught (?:ConvexError|Error): ([^\n]+)/);
    if (m) return m[1];
    return e.message.length > 200 ? "Something went wrong" : e.message;
  }
  return "Something went wrong";
}
