import { expect, test, type Page } from "@playwright/test"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

async function pageOverflowX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

async function expectTapTarget(locator: ReturnType<Page["getByRole"]>, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

const main = (page: Page) => page.getByRole("main")
const preview = (page: Page) => main(page).getByRole("group", { name: "Preview", exact: true })
const banner = (page: Page) => main(page).getByRole("region", { name: "Current status", exact: true })

for (const vp of VIEWPORTS) {
  test.describe(`responsive System Status (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("opens from the URL, switches preview, and does not scroll sideways", async ({
      page,
    }) => {
      await page.goto("/system-status")
      await expect(page.getByRole("heading", { level: 1, name: "System Status" })).toBeVisible()
      await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
      await expect(main(page).getByRole("listitem", { name: "Billing" })).toBeVisible()

      const notGreen = preview(page).getByRole("link", { name: "Not green", exact: true })
      await expectTapTarget(notGreen, "Not green")
      await expectTapTarget(preview(page).getByRole("link", { name: "Green", exact: true }), "Green")
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      await notGreen.click()
      await expect(page).toHaveURL(/preview=not-green$/)
      await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
      await expect(main(page).getByRole("listitem", { name: "Billing" })).toContainText("Degraded")
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })
  })
}

test.describe("responsive System Status (phone 360 sanity)", () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test("does not scroll the page sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expect(page.getByRole("heading", { level: 1, name: "System Status" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive System Status (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the header row and does not scroll sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await expect(preview(page).getByRole("link", { name: "Green", exact: true })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})
