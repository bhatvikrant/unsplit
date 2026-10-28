import { expect, test } from "@playwright/test";
import { createGroup, openAddExpense, saveExpense, signUp, uniq } from "./helpers";

test("mobile: menu sheet, add expense, no horizontal overflow", async ({ page }) => {
  await signUp(page, "Mo Bile", `${uniq("mo")}@unsplit.test`);
  // No hamburger on phones: the tab bar holds the sections and the page header holds search.
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
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
