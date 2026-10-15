import { expect, type Page } from "@playwright/test";

export function uniq(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function signUp(page: Page, name: string, email: string, password = "testpass123") {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
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

export async function logIn(page: Page, email: string, password = "testpass123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
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

export async function openAddExpense(page: Page) {
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Add an expense|Edit expense/ });
  await expect(dialog).toBeVisible();
  return dialog;
}
