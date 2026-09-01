import { expect, test } from "@playwright/test"

import { login, openPalette } from "./helpers"

test("cmd-K palette jumps to a case by number", async ({ page }) => {
  await login(page)
  await page.goto("/")
  await openPalette(page)
  await page
    .getByPlaceholder("Search cases and contacts…", { exact: false })
    .fill("#3")
  await page.getByRole("button", { name: /CSV export times out/ }).click()
  await expect(page).toHaveURL(/\/cases\/case_3/)
  await expect(
    page.getByRole("heading", { name: "CSV export times out on large ranges" })
  ).toBeVisible()
})

test("palette finds contacts by partial name", async ({ page }) => {
  await login(page)
  await page.goto("/")
  await openPalette(page)
  await page
    .getByPlaceholder("Search cases and contacts…", { exact: false })
    .fill("priya")
  // Case rows also mention the contact's name; only the contact row shows
  // the email address.
  await page.getByRole("button", { name: /priya@birchwood\.io/ }).click()
  await expect(page).toHaveURL(/\/contacts\/contact_priya/)
})
