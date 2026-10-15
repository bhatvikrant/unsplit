import { expect, test } from "@playwright/test";
import { createGroup, logIn, logOut, openAddExpense, signUp, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });

const alex = { name: "Alex Tester", email: `${uniq("alex")}@unsplit.test` };
const bea = { name: "Bea Moreno", email: `${uniq("bea")}@unsplit.test` };
const groupName = `Trip ${uniq("g")}`;

test("sign up, create group, equal split, balances", async ({ page }) => {
  await signUp(page, alex.name, alex.email);
  await expect(page.getByText("Nothing to split yet")).toBeVisible();
  await createGroup(page, groupName, [{ name: bea.name, email: bea.email }, { name: "Chris Okafor" }]);

  const dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Dinner at the fish place");
  await dialog.getByLabel("Amount", { exact: true }).fill("100");
  await expect(dialog.getByText("US$33.34").or(dialog.getByText("$33.34"))).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Dinner at the fish place/ })).toBeVisible();
  // Alex paid 100, owes 33.34 -> lent 66.66
  await expect(page.getByText(/66\.66/).first()).toBeVisible();
});

test("exact, percent, shares, adjustment and itemized splits validate and save", async ({ page }) => {
  await logIn(page, alex.email);
  await page.getByRole("link", { name: groupName }).first().click();

  // Exact: sums must match
  let dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Taxi");
  await dialog.getByLabel("Amount", { exact: true }).fill("30");
  await dialog.getByRole("tab", { name: "Exact amounts" }).click();
  await dialog.getByLabel("Alex Tester amount").fill("10");
  await dialog.getByLabel("Bea Moreno amount").fill("10");
  await expect(dialog.getByText(/off by/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await dialog.getByLabel("Chris Okafor amount").fill("10");
  await expect(dialog.getByText(/off by/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();

  // Percent
  dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Museum tickets");
  await dialog.getByLabel("Amount", { exact: true }).fill("45");
  await dialog.getByRole("tab", { name: "Percentages" }).click();
  await dialog.getByLabel("Alex Tester percent").fill("50");
  await dialog.getByLabel("Bea Moreno percent").fill("25");
  await dialog.getByLabel("Chris Okafor percent").fill("25");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();

  // Shares with multiple payers
  dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Groceries");
  await dialog.getByLabel("Amount", { exact: true }).fill("60");
  await dialog.getByRole("button", { name: "Multiple people paid" }).click();
  await dialog.getByLabel("Alex Tester paid").fill("40");
  await dialog.getByLabel("Bea Moreno paid").fill("20");
  await dialog.getByRole("tab", { name: "Shares" }).click();
  await dialog.getByLabel("Alex Tester shares").fill("2");
  await dialog.getByLabel("Bea Moreno shares").fill("1");
  await dialog.getByLabel("Chris Okafor shares").fill("1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();

  // Adjustment
  dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Wine");
  await dialog.getByLabel("Amount", { exact: true }).fill("40");
  await dialog.getByRole("tab", { name: "Adjustment" }).click();
  await dialog.getByLabel("Alex Tester extra").fill("10");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();

  // Itemized: total is derived from items
  dialog = await openAddExpense(page);
  await dialog.getByLabel("Description", { exact: true }).fill("Lunch");
  await dialog.getByRole("tab", { name: "Itemized" }).click();
  await dialog.getByLabel("Item 1 name").fill("Burger");
  await dialog.getByLabel("Item 1 price").fill("12");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await dialog.getByLabel("Item 2 name").fill("Salad");
  await dialog.getByLabel("Item 2 price").fill("8");
  await dialog.getByLabel("Tax").fill("2");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("22.00");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();

  await expect(page.getByRole("link", { name: /Lunch/ })).toBeVisible();
});

test("expense detail: comment, edit, delete, restore", async ({ page }) => {
  await logIn(page, alex.email);
  await page.getByRole("link", { name: groupName }).first().click();
  await page.getByRole("link", { name: /Taxi/ }).click();
  await expect(page.getByRole("heading", { name: "Taxi" })).toBeVisible();

  await page.getByLabel("Add a comment").fill("Split three ways, thanks!");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Split three ways, thanks!")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit expense" });
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("30.00");
  await dialog.getByLabel("Description", { exact: true }).fill("Taxi to the airport");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Taxi to the airport" })).toBeVisible();
  await expect(page.getByText(/changed description/)).toBeVisible();

  await page.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(page).toHaveURL(/\/groups\//);
  await expect(page.getByRole("link", { name: /Taxi to the airport/ })).toHaveCount(0);

  await page.goto("/trash");
  await expect(page.getByText("Taxi to the airport")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText("Expense restored")).toBeVisible();
});

test("settle up, activity feed, search, totals, export", async ({ page }) => {
  await logIn(page, alex.email);
  await page.getByRole("link", { name: groupName }).first().click();
  await page.getByRole("button", { name: "Settle up" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Settle up" });
  await dialog.getByLabel("Payer").click();
  await page.getByRole("option", { name: "Bea Moreno" }).click();
  await dialog.getByLabel("Recipient").click();
  await page.getByRole("option", { name: "You" }).click();
  await expect(dialog.getByLabel("Amount", { exact: true })).not.toHaveValue("");
  await dialog.getByLabel("Amount", { exact: true }).fill("20");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded").last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Bea Moreno paid you/ })).toBeVisible();

  await page.getByRole("link", { name: "Recent activity" }).click();
  await expect(page.getByText(/recorded a payment of/)).toBeVisible();

  await page.getByRole("textbox", { name: "Search expenses" }).fill("museum");
  await page.getByRole("textbox", { name: "Search expenses" }).press("Enter");
  await expect(page.getByRole("link", { name: /Museum tickets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Groceries/ })).toHaveCount(0);

  await page.getByRole("link", { name: groupName }).first().click();
  await page.getByRole("link", { name: "Totals" }).click();
  await expect(page.getByText("Total group spending")).toBeVisible();
  await page.getByRole("link", { name: "Charts" }).click();
  await expect(page.getByRole("heading", { name: "By category" })).toBeVisible();

  await page.getByRole("link", { name: "Expenses", exact: true }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as spreadsheet" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("group settings: simplify debts, whiteboard, remove blocked while unsettled", async ({ page }) => {
  await logIn(page, alex.email);
  await page.getByRole("link", { name: groupName }).first().click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("switch").first().click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.getByPlaceholder(/Notes for everyone/).fill("Wifi: fishplace / 12345");
  await page.getByRole("button", { name: "Save whiteboard" }).click();
  await page.getByRole("button", { name: /Remove Chris Okafor/ }).click();
  await expect(page.getByText(/settled up in this group before being removed/)).toBeVisible();
  await page.getByRole("link", { name: groupName }).first().click();
  await expect(page.getByText("Wifi: fishplace / 12345")).toBeVisible();
  await expect(page.getByText("simplified debts")).toBeVisible();
});

test("placeholder claim: Bea signs up with the invited email and sees the group", async ({ page }) => {
  await signUp(page, "Bea M", bea.email);
  await expect(page.getByRole("link", { name: groupName })).toBeVisible();
  await page.getByRole("link", { name: groupName }).first().click();
  await expect(page.getByRole("link", { name: /Dinner at the fish place/ })).toBeVisible();
  // Bea's view of the dashboard shows she owes Alex
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "You owe" })).toBeVisible();
  await logOut(page);
});

test("friend page, non-group expense, account settings", async ({ page }) => {
  await logIn(page, alex.email);
  await page.getByRole("button", { name: "Add a friend" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a friend" });
  await dialog.getByLabel("Name").fill("Dana Solo");
  await dialog.getByRole("button", { name: "Add friend" }).click();
  await expect(page).toHaveURL(/\/friends\//);
  await expect(page.getByRole("heading", { name: "Dana Solo", exact: true })).toBeVisible();

  const ex = await openAddExpense(page);
  await ex.getByLabel("Description", { exact: true }).fill("Concert ticket");
  await ex.getByLabel("Amount", { exact: true }).fill("80");
  await ex.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense added").last()).toBeVisible();
  await expect(page.getByText(/40\.00/).first()).toBeVisible();

  await page.goto("/account");
  await page.getByLabel("Name").fill("Alex T.");
  await page.getByLabel("Name").blur();
  await expect(page.getByText("Saved").last()).toBeVisible();
  await page.goto("/account/notifications");
  await page.getByRole("switch").first().click();
  await page.goto("/expenses/recurring");
  await expect(page.getByText("Nothing repeats yet")).toBeVisible();
});
