import { expect, test } from "@playwright/test";
import { createGroup, openAddExpense, saveExpense, signUp, uniq } from "./helpers";

test("mobile: menu sheet, add expense, no horizontal overflow", async ({ page }) => {
  await signUp(page, "Mo Bile", `${uniq("mo")}@unsplit.test`);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "All expenses" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The top bar stays pinned while the page scrolls.
  await page.evaluate(() => window.scrollTo(0, 600));
  const top = await page.getByRole("button", { name: "Open menu" }).evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(60);
  await page.getByRole("button", { name: "Start a group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Lisbon trip/).fill("Flat");
  await dialog.getByRole("button", { name: "Add a person" }).click();
  await dialog.getByLabel("Name", { exact: true }).first().fill("Roomie");
  await dialog.getByRole("button", { name: /^Create( group)?$/ }).click();
  await expect(page).toHaveURL(/\/groups\//);
  const ex = await openAddExpense(page);
  await ex.getByLabel("Description", { exact: true }).fill("Rent");
  await ex.getByLabel("Amount", { exact: true }).fill("1200");
  await saveExpense(page, ex);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  void createGroup;
});

test("mobile: settle up from home opens prefilled and records from the sheet's top bar", async ({ page }) => {
  await signUp(page, "Mo Settle", `${uniq("ms")}@unsplit.test`);
  await page.getByRole("button", { name: "Start a group" }).click();
  const create = page.getByRole("dialog");
  await create.getByPlaceholder(/Lisbon trip/).fill("Vibes with the Noida 37 running buddies and friends");
  await create.getByRole("button", { name: "Add a person" }).click();
  await create.getByLabel("Name", { exact: true }).first().fill("Beena");
  await create.getByRole("button", { name: /^Create( group)?$/ }).click();
  await expect(page).toHaveURL(/\/groups\//);
  const ex = await openAddExpense(page);
  await ex.getByLabel("Description", { exact: true }).fill("Cab");
  await ex.getByLabel("Amount", { exact: true }).fill("80");
  await saveExpense(page, ex);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }).click();
  await page.getByRole("main").getByRole("button", { name: "Settle up" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Settle up" });
  await expect(dialog.locator("#scope")).toContainText("Vibes");
  await expect(dialog.getByLabel("Payer")).toContainText("Beena");
  await expect(dialog.getByLabel("Recipient")).toContainText("You");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("40.00");
  // Picking the person already on the other side swaps the two instead of leaving Beena -> Beena.
  await dialog.getByLabel("Recipient").click();
  await page.getByRole("option", { name: "Beena" }).click();
  await expect(dialog.getByLabel("Payer")).toContainText("You");
  await expect(dialog.getByLabel("Recipient")).toContainText("Beena");
  await dialog.getByLabel("Payer").click();
  await page.getByRole("option", { name: "Beena" }).click();
  await expect(dialog.getByLabel("Payer")).toContainText("Beena");
  await expect(dialog.getByLabel("Recipient")).toContainText("You");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("40.00");
  await dialog.getByRole("button", { name: "Record", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Nobody owes you.")).toBeVisible();
  // A long group name truncates instead of widening Home past the screen.
  expect(await page.evaluate(() => window.innerWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
});
