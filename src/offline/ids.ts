/**
 * Temporary ids for things created while offline, and helpers to find and
 * rewrite them once the server has handed back the real id.
 */

export function tempId(table: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2, 18);
  return `tmp_${table}_${rand}`;
}

export function isTempId(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("tmp_");
}

/** True when any string value or object key anywhere inside `v` is a temp id. */
export function containsTempId(v: unknown): boolean {
  if (isTempId(v)) return true;
  if (Array.isArray(v)) return v.some(containsTempId);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => isTempId(k) || containsTempId(x));
  return false;
}

/** Deep-replace temp ids (values and object keys) with their real ids. */
export function rewriteIds<T>(v: T, map: Record<string, string>): T {
  if (typeof v === "string") return (Object.hasOwn(map, v) ? map[v] : v) as T;
  if (Array.isArray(v)) return v.map((x) => rewriteIds(x, map)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[Object.hasOwn(map, k) ? map[k] : k] = rewriteIds(x, map);
    return out as T;
  }
  return v;
}

/** JSON with sorted keys, so equal args always produce the same cache key. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function queryKey(name: string, args: unknown): string {
  return `${name}|${stableStringify(args ?? {})}`;
}

/** Same rule as convex/lib/access.ts, kept here so the client bundle stays free of server code. */
export function pairKeyOf(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function pairUsers(pairKey: string): [string, string] {
  const [a, b] = pairKey.split(":");
  return [a, b];
}
