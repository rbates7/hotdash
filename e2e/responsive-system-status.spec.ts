import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"

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

async function expectPreviewLabelsOneLine(page: Page) {
  const group = preview(page)
  await expectOneLineLabel(group.getByRole("link", { name: "Green", exact: true }), "Green")
  await expectOneLineLabel(group.getByRole("link", { name: "Not green", exact: true }), "Not green")
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
      await expectPreviewLabelsOneLine(page)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      if (vp.name === "phone") {
        await expectTapTarget(
          main(page).getByRole("listitem", { name: "chlkapp.com" }).getByRole("link"),
          "chlkapp.com row link"
        )
        await expectTapTarget(
          main(page).getByRole("listitem", { name: "Sentry errors (24h)" }).getByRole("link"),
          "Sentry row link"
        )
      }

      await notGreen.click()
      await expect(page).toHaveURL(/preview=not-green$/)
      await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
      await expect(main(page).getByRole("listitem", { name: "Billing" })).toContainText("Degraded")
      await expectPreviewLabelsOneLine(page)
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

test.describe("responsive System Status (tablet-landscape 1180)", () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test("B2: Preview labels stay one line and the page does not scroll sideways", async ({
    page,
  }) => {
    await page.goto("/system-status")
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await expectTapTarget(preview(page).getByRole("link", { name: "Not green", exact: true }), "Not green")
    await expectTapTarget(preview(page).getByRole("link", { name: "Green", exact: true }), "Green")
    await expectPreviewLabelsOneLine(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    await preview(page).getByRole("link", { name: "Not green", exact: true }).click()
    await expect(page).toHaveURL(/preview=not-green$/)
    await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
    await expectPreviewLabelsOneLine(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive System Status (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the header row and does not scroll sideways", async ({ page }) => {
    await page.goto("/system-status")
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await expect(preview(page).getByRole("link", { name: "Green", exact: true })).toBeVisible()
    await expectPreviewLabelsOneLine(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

const READABLE_VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
] as const

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme)
}

for (const theme of ["light", "dark"] as const) {
  for (const vp of READABLE_VIEWPORTS) {
    test.describe(`readable System Status (${vp.name} ${theme})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test(`B2: text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await forceTheme(page, theme)
        await page.goto("/system-status")
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
        )
        const label = `${theme}/${vp.name}`
        await expectReadable(page.getByRole("heading", { level: 1, name: "System Status" }), `${label}/title`, expect)
        await expectReadable(preview(page), `${label}/preview`, expect)
        await expectReadable(banner(page), `${label}/banner`, expect)
        await expectReadable(main(page).getByRole("listitem", { name: "Billing" }), `${label}/billing`, expect)
      })
    })
  }
}
