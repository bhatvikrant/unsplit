import { expect, type Locator, type Page } from "@playwright/test";

export function uniq(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const PASSWORD = "testpass123";

/**
 * Signs in through the test-only email + password provider (README, "Test"): the login page
 * exposes `window.__e2eSignIn` in dev and VITE_E2E_AUTH builds, and the local deployment needs
 * E2E_AUTH=1. Resolves once the app has landed on the dashboard.
 */
async function e2eSignIn(page: Page, params: Record<string, string>) {
  await page.goto("/login");
  await page
    .waitForFunction(() => typeof window.__e2eSignIn === "function", undefined, { timeout: 15_000 })
    .catch(() => {
      throw new Error("No test sign-in hook on /login. Run the Vite dev server, or a build made with VITE_E2E_AUTH=1 (README, Test).");
    });
  await page.evaluate((p) => window.__e2eSignIn!(p), params).catch((err: Error) => {
    if (/not configured|Provider password/i.test(err.message)) {
      throw new Error("The deployment has no test sign-in: run `npx convex env set E2E_AUTH 1` on the local deployment (README, Test).");
    }
    throw err;
  });
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function signUp(page: Page, name: string, email: string, password = PASSWORD) {
  await e2eSignIn(page, { flow: "signUp", name, email, password });
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await e2eSignIn(page, { flow: "signIn", email, password });
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: /Alex|Bea|Chris|Dana|Tester|Moreno|Okafor/ }).first().click().catch(() => {});
  // Fallback: open the user menu by its avatar button (last button in the header).
  const menuItem = page.getByRole("menuitem", { name: "Log out" });
  if (!(await menuItem.isVisible().catch(() => false))) {
    await page.locator("header button").last().click();
  }
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$|\/login/);
}


export async function createGroup(page: Page, name: string, people: { name: string; email?: string }[]) {
  await page.getByRole("button", { name: "Create a group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Lisbon trip/).fill(name);
  for (const [i, p] of people.entries()) {
    await dialog.getByRole("button", { name: "Add a person" }).click();
    await dialog.getByLabel("Name", { exact: true }).nth(i).fill(p.name);
    if (p.email) await dialog.getByLabel("Email", { exact: true }).nth(i).fill(p.email);
  }
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\//);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/**
 * Waits until the server has taken every change made online: the optimistic row (marked "Not
 * synced yet") is swapped for the real one, and the old row animates out for a moment, so locating
 * a row any earlier can find two of them.
 */
export async function synced(page: Page) {
  await expect(page.getByLabel("Not synced yet")).toHaveCount(0);
}

/** Saves the add/edit expense dialog and waits for the server to take it. */
export async function saveExpense(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await synced(page);
}

export async function openAddExpense(page: Page) {
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Add an expense|Edit expense/ });
  await expect(dialog).toBeVisible();
  return dialog;
}
