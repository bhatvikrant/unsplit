#!/usr/bin/env node
/**
 * Times a cold first load on throttled Slow 3G against a production preview, so a bundle change can
 * be judged by what a phone on a bad network sees. Needs a build made with VITE_E2E_AUTH=1 served by
 * `vite preview`, and the local Convex deployment with E2E_AUTH=1 (README, Test).
 *
 *   VITE_CONVEX_URL=http://127.0.0.1:3212 VITE_E2E_AUTH=1 npx vite build && npx vite preview
 *   node scripts/measure-load.mjs            # BASE=http://localhost:4173 RUNS=3
 *
 * Each run is a fresh browser context with no HTTP cache and no service worker, under CDP Slow 3G
 * (2000 ms latency, 50 KiB/s each way) and 4x CPU slowdown. It reports, per page, the time from
 * navigation to the page being usable and the JavaScript bytes that came over the wire by then.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:4173";
const RUNS = Number(process.env.RUNS ?? 3);

const pages = [
  // Signed in: the dashboard has its data (a new account's empty state) and its buttons work.
  { name: "dashboard (signed in)", path: "/dashboard", signedIn: true, ready: (p) => p.getByRole("button", { name: "Start a group" }).waitFor({ timeout: 120_000 }) },
  // Signed out: the landing page's headline.
  { name: "landing (signed out)", path: "/", signedIn: false, ready: (p) => p.getByRole("heading", { level: 1 }).waitFor({ timeout: 120_000 }) },
];

const browser = await chromium.launch();

// One test account, signed up unthrottled; its tokens live in localStorage.
const setup = await browser.newContext({ baseURL: BASE });
const sp = await setup.newPage();
await sp.goto("/login");
await sp.waitForFunction(() => typeof window.__e2eSignIn === "function", undefined, { timeout: 30_000 });
const email = `measure-${Date.now().toString(36)}@unsplit.test`;
await sp.evaluate((p) => window.__e2eSignIn(p), { flow: "signUp", name: "Measure Tester", email, password: "testpass123" });
await sp.waitForURL(/\/dashboard/);
await sp.getByRole("button", { name: "Start a group" }).waitFor();
const signedInState = await setup.storageState();
await setup.close();

const results = {};
for (const target of pages) {
  results[target.name] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ baseURL: BASE, serviceWorkers: "block", storageState: target.signedIn ? signedInState : undefined });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 2000, downloadThroughput: 51200, uploadThroughput: 51200 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const jsIds = new Set();
    cdp.on("Network.responseReceived", (e) => {
      if (e.type === "Script") jsIds.add(e.requestId);
    });
    let scriptBytes = 0;
    cdp.on("Network.loadingFinished", (e) => {
      if (jsIds.has(e.requestId)) scriptBytes += e.encodedDataLength ?? 0;
    });
    const t0 = Date.now();
    await page.goto(target.path, { waitUntil: "commit", timeout: 120_000 });
    await target.ready(page);
    const ms = Date.now() - t0;
    results[target.name].push({ ms, scriptKB: Math.round(scriptBytes / 1024) });
    console.log(`${target.name} run ${i + 1}: ${(ms / 1000).toFixed(1)} s, ${Math.round(scriptBytes / 1024)} KiB JS over the wire`);
    await ctx.close();
  }
}
await browser.close();

console.log("\nMedian time to usable:");
for (const [name, runs] of Object.entries(results)) {
  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`  ${name}: ${(median / 1000).toFixed(1)} s (runs: ${runs.map((r) => (r.ms / 1000).toFixed(1)).join(", ")}; JS ${runs[0].scriptKB} KiB)`);
}
