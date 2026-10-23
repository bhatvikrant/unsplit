import { expect, test } from "@playwright/test";
import { createGroup, openAddExpense, saveExpense, signUp, uniq } from "./helpers";

/**
 * Offline-first: changes made with no connection show up immediately, survive
 * a reload (when the service worker is present, i.e. against a production
 * build: E2E_SW=1), and reach the server once the connection is back.
 */
const withServiceWorker = Boolean(process.env.E2E_SW);

test("adds an expense and a comment offline, then syncs when back online", async ({ page, context }) => {
  const alex = { name: "Alex Tester", email: `${uniq("alex")}@unsplit.test` };
  const groupName = `Offline ${uniq("g")}`;
  await signUp(page, alex.name, alex.email);
  await createGroup(page, groupName, [{ name: "Bea Moreno" }]);
  // Let the first page of expenses and the group view land in the cache.
  await expect(page.getByText("No expenses yet")).toBeVisible();
  // The app shell is only served offline once the service worker has precached it.
  if (withServiceWorker) await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toContainText("You're offline");

  const dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Offline dinner");
  await dialog.getByLabel("Amount", { exact: true }).fill("50");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("link", { name: /Offline dinner/ });
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Not synced yet")).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toContainText("1 change waiting");
  // Alex paid 50, owes 25 -> lent 25; the group balance follows.
  await expect(page.getByText(/25\.00/).first()).toBeVisible();

  // The detail page works on the temp id, and takes a comment.
  await row.click();
  await expect(page).toHaveURL(/\/expenses\/tmp_/);
  await expect(page.getByRole("heading", { name: "Offline dinner" })).toBeVisible();
  await page.getByLabel("Add a comment").fill("queued while offline");
  await page.getByRole("button", { name: "Post comment" }).click();
  const comment = page.getByRole("paragraph").filter({ hasText: "queued while offline" });
  await expect(comment).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toContainText("2 changes waiting");

  if (withServiceWorker) {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Offline dinner" })).toBeVisible();
    await expect(comment).toBeVisible();
    await expect(page.getByTestId("offline-banner")).toContainText("2 changes waiting");
  }

  await context.setOffline(false);
  await expect(page.getByTestId("offline-banner")).toBeHidden({ timeout: 20_000 });
  // Synced: still on the detail page, now backed by the real document.
  await expect(page.getByRole("heading", { name: "Offline dinner" })).toBeVisible();
  await expect(comment).toBeVisible();
  await expect(page.getByText(/added this/)).toBeVisible();

  // Nothing was duplicated and the temp marker is gone.
  await page.goto("/expenses");
  await expect(page.getByRole("link", { name: /Offline dinner/ })).toHaveCount(1);
  await expect(page.getByLabel("Not synced yet")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Offline dinner/ })).toHaveAttribute("href", /\/expenses\/(?!tmp_)/);
});

test("deleting offline moves the expense to deleted items and the server agrees afterwards", async ({ page, context }) => {
  const alex = { name: "Dana Tester", email: `${uniq("dana")}@unsplit.test` };
  await signUp(page, alex.name, alex.email);
  await createGroup(page, `Trash ${uniq("g")}`, [{ name: "Chris Okafor" }]);
  const dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Taxi home");
  await dialog.getByLabel("Amount", { exact: true }).fill("20");
  await saveExpense(page, dialog);
  await page.getByRole("link", { name: /Taxi home/ }).click();
  await expect(page.getByRole("heading", { name: "Taxi home" })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toContainText("You're offline");
  await page.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Deleted").last()).toBeVisible();
  await expect(page).toHaveURL(/\/groups\//);
  await expect(page.getByRole("link", { name: /Taxi home/ })).toHaveCount(0);
  await expect(page.getByText("Everyone is settled up.")).toBeVisible();

  // Client-side navigation only: without the service worker a full load needs the network.
  await page.getByRole("button", { name: /Dana Tester/ }).first().click();
  await page.getByRole("menuitem", { name: "Deleted items" }).click();
  await expect(page).toHaveURL(/\/trash/);
  await expect(page.getByRole("link", { name: /Taxi home/ })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId("offline-banner")).toBeHidden({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("link", { name: /Taxi home/ })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText("Nothing deleted")).toBeVisible();
});
