#!/usr/bin/env node
/**
 * One-off: shrinks the images already stored (receipts, avatars, group covers) the way the app now
 * does before an upload (orientation fixed, longest side capped, WebP at quality 85) and swaps
 * them in place. Each image is backed up, re-encoded and uploaded, then its document is pointed at
 * the copy and only then is the original deleted (convex/maintenance.ts: swapImage). An image that
 * would not come out smaller is left alone. Nothing is written without --apply.
 *
 *   npm install --no-save sharp
 *   node scripts/shrink-images.mjs [--prod | --deployment <name>] [--apply] [--backup <dir>]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EDGE = { receipt: 2560, cover: 1600, avatar: 512 };
const QUALITY = 85;

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const prod = argv.includes("--prod");
const deployment = argv.includes("--deployment") ? argv[argv.indexOf("--deployment") + 1] : null;
const backupDir = argv.includes("--backup") ? argv[argv.indexOf("--backup") + 1] : `image-backup-${new Date().toISOString().slice(0, 10)}`;
const where = prod ? ["--prod"] : deployment ? ["--deployment", deployment] : [];

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  fail("sharp is not installed: run `npm install --no-save sharp` first.");
}

function run(name, args = {}) {
  const r = spawnSync("npx", ["convex", "run", ...where, name, JSON.stringify(args)], { encoding: "utf8", maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`npx convex run ${name} failed:\n${r.stderr || r.stdout}`);
  const out = r.stdout.trim();
  return out ? JSON.parse(out) : null;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

console.log(`${apply ? "Shrinking" : "Dry run on"} ${prod ? "PRODUCTION" : deployment ?? "dev"} images\n`);
const images = run("maintenance:listImages");
let before = 0, after = 0, count = 0, swapped = 0;
if (apply) mkdirSync(backupDir, { recursive: true });

for (const img of images) {
  const label = `${img.kind} ${img.storageId}`;
  if (!img.url) { console.log(`${label}: no URL, skipped`); continue; }
  if (!/^image\/(jpeg|png|webp|avif|heic|heif|tiff|bmp)$/.test(img.contentType ?? "")) { console.log(`${label}: ${img.contentType}, left as is`); continue; }
  const original = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  const edge = EDGE[img.kind];
  const small = await sharp(original).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
  if (small.length >= original.length) { console.log(`${label}: ${kb(original.length)}, already small, left as is`); continue; }
  const meta = await sharp(small).metadata();
  console.log(`${label}: ${kb(original.length)} -> ${kb(small.length)} (${meta.width}x${meta.height} webp)`);
  before += original.length;
  after += small.length;
  count++;
  if (!apply) continue;

  writeFileSync(join(backupDir, `${img.storageId}.${(img.contentType ?? "image/jpeg").split("/")[1]}`), original);
  const uploadUrl = run("maintenance:imageUploadUrl");
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/webp" }, body: small });
  if (!res.ok) fail(`Upload failed (${res.status}) for ${label}`);
  const { storageId } = await res.json();
  const ok = run("maintenance:swapImage", { kind: img.kind, docId: img.docId, from: img.storageId, to: storageId });
  if (ok) swapped++;
  else console.log(`${label}: replaced by someone meanwhile, left alone`);
}

if (apply) console.log(`\nOriginals backed up in ${backupDir}/`);
console.log(`\n${apply ? `Shrank ${swapped} of` : "Would shrink"} ${count} image(s): ${kb(before)} -> ${kb(after)}`);
