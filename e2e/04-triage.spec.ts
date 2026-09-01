import { expect, test } from "@playwright/test"

import { login } from "./helpers"

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("promoting a triage thread creates a contact and a case", async ({
  page,
}) => {
  await page.goto("/triage")
  const alexCard = page.locator('[data-slot="triage-card"]', {
    hasText: "alex@contractorplus.app",
  })
  await expect(alexCard.getByText("2 messages")).toBeVisible()

  // isVisible-guarded and retried: a click that lands before hydration is
  // simply lost, so re-click until the card actually resolves.
  const promote = alexCard.getByRole("button", { name: "Promote to case" })
  await expect(async () => {
    if (await promote.isVisible()) await promote.click()
    await expect(page.getByText("alex@contractorplus.app")).toHaveCount(0, {
      timeout: 3000,
    })
  }).toPass({ timeout: 20_000 })

  // The sender is now a contact with a case attached.
  await page.goto("/contacts")
  await page.getByRole("link", { name: "Alex Kim" }).click()
  await expect(page.getByText("Integration question")).toBeVisible()
  await page.getByRole("link", { name: "Integration question" }).click()
  await expect(
    page.getByText("Following up on the below", { exact: false })
  ).toBeVisible()
})

test("ignoring the remaining thread clears triage", async ({ page }) => {
  await page.goto("/triage")
  const lenaCard = page.locator('[data-slot="triage-card"]', {
    hasText: "lena@futurebridge.vc",
  })
  const moreButton = lenaCard.getByRole("button", { name: "More actions" })
  await expect(async () => {
    if (await moreButton.isVisible()) {
      await moreButton.click()
      await page
        .getByRole("menuitem", { name: "Ignore this thread" })
        .click({ timeout: 2000 })
    }
    await expect(page.getByText("Triage is clear")).toBeVisible({
      timeout: 3000,
    })
  }).toPass({ timeout: 20_000 })
})
