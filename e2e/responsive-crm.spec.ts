import { expect, test } from "@playwright/test"

import { pageOverflowX } from "./support/shell"

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const) {
  test(`copied CRM navigation remains usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto("/crm")

    const nav = page.getByRole("navigation", { name: "CRM", exact: true })
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "Accounts",
      "Cases",
      "Contacts",
      "Triage",
      "Settings",
    ])
    await expect(nav).toBeInViewport()
    await expect(
      page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })
    ).toBeInViewport()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
}
