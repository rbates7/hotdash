import { expect, test } from "@playwright/test"

import { login } from "./helpers"

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("cases list filters by status and search", async ({ page }) => {
  await page.goto("/cases")
  await expect(page.getByText("8 cases")).toBeVisible()

  await page.getByRole("link", { name: "Open", exact: true }).click()
  await expect(page).toHaveURL(/status=open/)
  await expect(page.getByText("3 cases matching filters")).toBeVisible()

  await page.getByRole("link", { name: "All", exact: true }).click()
  await page.getByPlaceholder("Search cases…").fill("safari")
  await expect(page.getByText("1 case matching filters")).toBeVisible()
  await expect(page.getByText("Login loop on Safari 18")).toBeVisible()
})

test("case detail shows the email timeline and contact panel", async ({
  page,
}) => {
  await page.goto("/cases")
  await page.getByText("Can't invite teammates to workspace").click()
  await expect(page).toHaveURL(/\/cases\/case_1/)
  await expect(
    page.getByText("Hey — when I try to invite my teammates", { exact: false })
  ).toBeVisible()
  // The founder's reply renders as an outbound message.
  await expect(
    page.getByText("Hi Dana, sorry about that!", { exact: false })
  ).toBeVisible()
  await expect(page.getByText("invite-spinner.png")).toBeVisible()
  await expect(page.getByText("dana@acme.com").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Open in Gmail" })).toBeVisible()
})

test("status path moves the case and records a system note", async ({
  page,
}) => {
  await page.goto("/cases/case_7")
  await page.getByRole("button", { name: "Closed" }).click()
  await expect(
    page.getByText("Status changed to Closed · just now")
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "Closed" })).toHaveAttribute(
    "aria-current",
    "step"
  )
})

test("notes persist across reloads", async ({ page }) => {
  await page.goto("/cases/case_1")
  // Retried as a block: a click that lands before hydration is re-run.
  await expect(async () => {
    await page
      .getByPlaceholder("Add an internal note…", { exact: false })
      .fill("E2E test note — checking persistence.")
    await page.getByRole("button", { name: "Add note" }).click()
    await expect(
      page.getByText("E2E test note — checking persistence.")
    ).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20_000 })
  await page.reload()
  await expect(
    page.getByText("E2E test note — checking persistence.")
  ).toBeVisible()
})

test("contact detail shows plan and case history", async ({ page }) => {
  await page.goto("/contacts")
  await page.getByRole("link", { name: "Dana Whitfield" }).click()
  await expect(page).toHaveURL(/\/contacts\/contact_dana/)
  await expect(page.getByText("Growth")).toBeVisible()
  await expect(
    page.getByText("Can't invite teammates to workspace")
  ).toBeVisible()
  await expect(page.getByText("Billing question about seats")).toBeVisible()
})
