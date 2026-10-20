import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

async function pageOverflowX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/** Measure the painted label, not the 44px tap target. */
async function expectOneLineLabel(locator: Locator, label: string) {
  const { textHeight, lineHeight } = await locator.evaluate((el) => {
    const range = document.createRange()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let top = Infinity
    let bottom = -Infinity
    let node = walker.nextNode()
    while (node) {
      if (node.textContent?.trim()) {
        range.selectNodeContents(node)
        const r = range.getBoundingClientRect()
        top = Math.min(top, r.top)
        bottom = Math.max(bottom, r.bottom)
      }
      node = walker.nextNode()
    }
    const cs = getComputedStyle(el)
    const lineHeight =
      cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight)
    return { textHeight: bottom - top, lineHeight }
  })
  expect(textHeight, `${label}: painted`).toBeGreaterThan(0)
  expect(textHeight, `${label}: stays on one line`).toBeLessThanOrEqual(lineHeight + 1)
}

const main = (page: Page) => page.getByRole("main")
const banner = (page: Page) => main(page).getByRole("region", { name: "Current status", exact: true })

/**
 * The real page (the only one: no preview control, no `?preview=` route).
 * Nothing is polled yet, so no checks and Not connected in the header.
 */
async function expectRealPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "System Status" })).toBeVisible()
  await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
  await expect(main(page).locator("header").getByTestId("not-connected")).toBeVisible()
  await expect(main(page).getByRole("group", { name: "Preview", exact: true })).toHaveCount(0)
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive System Status (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("opens on the real page with no preview control, ignores ?preview=, and does not scroll sideways", async ({
      page,
    }) => {
      await page.goto("/system-status")
      await expectRealPage(page)
      await expectOneLineLabel(main(page).locator("header").getByTestId("not-connected"), "Not connected badge")
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      await page.goto("/system-status?preview=not-green")
      await expectRealPage(page)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })
  })
}

test.describe("responsive System Status (phone 360 sanity)", () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test("does not scroll the page sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expectRealPage(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive System Status (tablet-landscape 1180)", () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test("B2: the real page keeps its badge on one line and does not scroll sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expectRealPage(page)
    await expectOneLineLabel(main(page).locator("header").getByTestId("not-connected"), "Not connected badge")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive System Status (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the header row and does not scroll sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expectRealPage(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

const READABLE_VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
] as const

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

for (const theme of ["light", "dark"] as const) {
  for (const vp of READABLE_VIEWPORTS) {
    test.describe(`readable System Status (${vp.name} ${theme})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test(`B2: text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await page.goto("/system-status")
        await forceTheme(page, theme)
        const label = `${theme}/${vp.name}`
        await expectRealPage(page)
        await expectReadable(page.getByRole("heading", { level: 1, name: "System Status" }), `${label}/title`, expect)
        await expectReadable(banner(page), `${label}/banner`, expect)
        await expectReadable(main(page).locator("header").getByTestId("not-connected"), `${label}/not connected`, expect)
        await expectReadable(main(page).getByRole("region", { name: "Components", exact: true }), `${label}/components`, expect)
      })
    })
  }
}
