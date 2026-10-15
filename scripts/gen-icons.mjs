// Renders the app icons in public/ from the mark in public/icon.svg.
//
//   node scripts/gen-icons.mjs
//
// - icon-192/512.png: rounded tile with transparent corners, for browsers
//   and Android launchers that show icons as-is ("any").
// - icon-maskable-192/512.png: the same mark on a full-bleed tile. Android
//   crops these into its own shape; the S sits inside the 80% safe zone.
// - apple-touch-icon.png: 180x180 full-bleed, no transparency. iOS applies
//   its own corner radius and fills transparent pixels with black, so the
//   rounded version must not be used here.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
const mark = svg.match(/<path[^>]*\/>/)[0];
const fill = svg.match(/fill="(#[0-9a-f]{6})"/i)[1];

const rounded = svg;
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${fill}"/>${mark}</svg>`;

const targets = [
  ["icon-192.png", rounded, 192],
  ["icon-512.png", rounded, 512],
  ["icon-maskable-192.png", fullBleed, 192],
  ["icon-maskable-512.png", fullBleed, 512],
  ["apple-touch-icon.png", fullBleed, 180],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, art, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
  const png = await page.screenshot({ omitBackground: true, type: "png" });
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`wrote public/${name} (${size}x${size})`);
}
await browser.close();
