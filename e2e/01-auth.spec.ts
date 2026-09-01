import { expect, test } from "@playwright/test"

import { E2E_PASSWORD } from "./helpers"

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/cases")
  await expect(page).toHaveURL(/\/login\?next=%2Fcases/)
  await expect(page.getByLabel("Password")).toBeVisible()
})

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Password").fill("not-the-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  // p[role=alert] — the bare role collides with Next's route announcer.
  await expect(page.locator("p[role='alert']")).toContainText("Wrong password")
  await expect(page).toHaveURL(/\/login/)
})

test("right password reaches the dashboard", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Password").fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
})
