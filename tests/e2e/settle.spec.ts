import { expect, test, type Page } from "@playwright/test";
import { createGroup, openAddExpense, saveExpense, signUp, synced, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });

const alex = { name: "Alex Tester", email: `${uniq("alex")}@unsplit.test` };
const bea = { name: "Bea Moreno", email: `${uniq("bea")}@unsplit.test` };
const groupName = `Fam ${uniq("g")}`;

/** The settle-up dialog opens ready to record: group, both people and the amount already chosen. */
async function expectPrefilled(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settle up" });
  await expect(dialog.getByRole("combobox", { name: "Where" }).or(dialog.locator("#scope"))).toContainText(groupName);
  await expect(dialog.getByLabel("Payer")).toContainText(bea.name);
  await expect(dialog.getByLabel("Recipient")).toContainText("You");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("50.00");
  await expect(dialog.getByRole("button", { name: "Record payment" })).toBeEnabled();
  return dialog;
}

test("settle up opens prefilled from every entry point and records", async ({ page }) => {
  await signUp(page, alex.name, alex.email);
  await createGroup(page, groupName, [{ name: bea.name, email: bea.email }]);
  const add = await openAddExpense(page);
  await add.getByLabel("Description", { exact: true }).fill("Groceries");
  await add.getByLabel("Amount", { exact: true }).fill("100");
  await saveExpense(page, add);
  await synced(page);

  // Home, the hero button: nothing passed, the biggest balance is picked.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Settle up" }).first().click();
  let dialog = await expectPrefilled(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The friend page: settles in the group the balance is in.
  await page.getByRole("link", { name: bea.name }).first().click();
  await expect(page).toHaveURL(/\/friends\//);
  await page.getByRole("main").getByRole("button", { name: "Settle up" }).click();
  dialog = await expectPrefilled(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Home, the row under "You're owed" (the one in the bug report), then record it.
  await page.goto("/dashboard");
  await page.getByRole("main").getByRole("button", { name: "Settle up" }).last().click();
  dialog = await expectPrefilled(page);
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toBeHidden();
  await synced(page);
  await expect(page.getByText("Nobody owes you.")).toBeVisible();
});
