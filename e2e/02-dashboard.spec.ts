import { expect, test } from "@playwright/test"

import { login } from "./helpers"

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("dashboard stats match the seed data", async ({ page }) => {
  await page.goto("/")
  // Seed: 1 new, 3 open, 2 waiting, 1 urgent not closed.
  const stat = (label: string) =>
    page
      .locator("a", { has: page.getByText(label, { exact: true }) })
      .locator("p")
      .first()
  await expect(stat("New")).toHaveText("1")
  await expect(stat("Open")).toHaveText("3")
  await expect(stat("Waiting on customer")).toHaveText("2")
  await expect(stat("Urgent, not closed")).toHaveText("1")
})

test("oldest untouched surfaces the stalest open case first", async ({
  page,
}) => {
  await page.goto("/")
  const card = page.locator("div", {
    has: page.getByText("Oldest untouched", { exact: true }),
  })
  // Case #5 (API rate limits, 5d old) is the stalest non-waiting case.
  await expect(
    card.getByText("API rate limits for reporting integration")
  ).toBeVisible()
})

test("triage banner links to triage", async ({ page }) => {
  await page.goto("/")
  await page.getByText(/messages from unknown senders/).click()
  await expect(page).toHaveURL(/\/triage/)
  await expect(page.getByRole("heading", { name: "Triage" })).toBeVisible()
})
