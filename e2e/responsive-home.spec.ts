import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { liveSummary } from "./support/stripe"
import { expectTapTarget } from "./support/tap-target"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

async function pageOverflowX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/**
 * Wait for /api/stripe/summary to answer: nothing on Home still shows a
 * Stripe placeholder. The placeholders hold the loaded height, but geometry
 * is measured against the settled page all the same.
 */
async function stripeSettled(page: Page) {
  await expect(page.locator('main [data-source="loading"]')).toHaveCount(0)
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive Home (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("opens from the URL, runs the happy path, and does not scroll sideways", async ({
      page,
    }) => {
      await page.goto("/home")
      await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
      await expect(page.getByText(/pulse$/)).toBeVisible()
      await expect(page.getByRole("heading", { level: 2, name: "No #1 yet" })).toBeVisible()
      await expect(page.getByRole("article", { name: "Subscribers" })).toHaveAttribute("data-source", "not_connected")
      await expect(page.getByRole("article", { name: "Cash this week" })).toHaveAttribute("data-source", "not_connected")
      await expect(page.locator("main").getByText(/Dummy \/ design mock/i)).toHaveCount(0)
      await expect(page.getByText(/agents working/)).toHaveCount(0)
      await expect(page.getByText(/waiting/)).toHaveCount(0)

      await expectTapTarget(
        page.getByRole("region", { name: "Number one" }).getByRole("link", { name: "My Desk" }),
        "My Desk"
      )
      await expectTapTarget(
        page.getByRole("link", { name: "Open Agent Workplace" }),
        "Open Agent Workplace"
      )
      await expectTapTarget(page.getByRole("link", { name: "Open Inbox" }), "Open Inbox")

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })
  })
}

test.describe("responsive Home (phone 360 sanity)", () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test("does not scroll the page sideways", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    await expect(page.getByRole("article", { name: "Subscribers" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive Home (tablet-landscape 1180)", () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test("B2: doors go from 3 across to 2+1", async ({ page }) => {
    await page.goto("/home")
    const doors = page.getByRole("group", { name: "Doors" })
    const metrics = doors.getByRole("region", { name: "Metrics" })
    const workplace = doors.getByRole("region", { name: "Agent Workplace" })
    const inbox = doors.getByRole("region", { name: "Inbox" })
    await expect(metrics).toBeVisible()
    await expect(workplace).toBeVisible()
    await expect(inbox).toBeVisible()
    await stripeSettled(page)
    const m = await metrics.boundingBox()
    const w = await workplace.boundingBox()
    const i = await inbox.boundingBox()
    expect(m && w && i, "three doors painted").toBeTruthy()
    expect(Math.abs(m!.y - w!.y), "Metrics and Workplace share a row").toBeLessThan(2)
    expect(w!.x, "Workplace sits beside Metrics").toBeGreaterThan(m!.x + m!.width - 1)
    expect(i!.y, "Inbox drops under the first row").toBeGreaterThan(m!.y + m!.height - 1)
    expect(i!.width, "Inbox spans both columns").toBeGreaterThan(m!.width)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive Home (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the three doors in one row and does not scroll sideways", async ({ page }) => {
    await page.goto("/home")
    const doors = page.getByRole("group", { name: "Doors" })
    const metrics = doors.getByRole("region", { name: "Metrics" })
    const workplace = doors.getByRole("region", { name: "Agent Workplace" })
    const inbox = doors.getByRole("region", { name: "Inbox" })
    await expect(metrics).toBeVisible()
    await expect(workplace).toBeVisible()
    await expect(inbox).toBeVisible()
    await stripeSettled(page)
    const m = await metrics.boundingBox()
    const w = await workplace.boundingBox()
    const i = await inbox.boundingBox()
    expect(m && w && i, "three doors painted").toBeTruthy()
    expect(Math.abs(m!.y - w!.y), "Workplace stays on the first row").toBeLessThan(2)
    expect(Math.abs(m!.y - i!.y), "Inbox stays on the first row").toBeLessThan(2)
    expect(w!.x).toBeGreaterThan(m!.x)
    expect(i!.x).toBeGreaterThan(w!.x)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

const SETTLE_VIEWPORTS = [
  { name: "phone 390", width: 390, height: 844 },
  { name: "desktop 1440", width: 1440, height: 900 },
] as const

const SETTLE_CASES = SETTLE_VIEWPORTS.flatMap((vp) =>
  (["not connected", "connected"] as const).map((answer) => ({ vp, answer }))
)

for (const { vp, answer } of SETTLE_CASES) {
  test.describe(`responsive Home (${vp.name}, Stripe ${answer})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("the doors do not move when the Stripe summary lands", async ({ page }) => {
      let release!: () => void
      const held = new Promise<void>((r) => (release = r))
      await page.route("**/api/stripe/summary**", async (route) => {
        await held
        // Not connected is the e2e server's own answer (it has no key).
        if (answer === "connected") await route.fulfill({ json: liveSummary("connected") })
        else await route.continue()
      })
      await page.goto("/home")
      const doors = page.getByRole("group", { name: "Doors" })
      await expect(page.getByRole("article", { name: "Subscribers" })).toHaveAttribute("data-source", "loading")
      // Only Stripe is held. The Paying coaches tile in the same strip has
      // its own fetch (/api/paying-coaches, not connected on the e2e
      // server); a Not connected card is shorter than its loading
      // placeholder (Deke, #67), so if it lands after `before` the doors
      // move up for a reason that is not Stripe's. Let it settle first.
      await expect(page.getByRole("article", { name: "Paying coaches" })).not.toHaveAttribute("data-source", "loading")
      await page.evaluate(() => document.fonts.ready)
      const before = await doors.boundingBox()
      release()
      await stripeSettled(page)
      const after = await doors.boundingBox()
      expect(before && after, "doors painted").toBeTruthy()
      if (answer === "connected") expect(after!.y, "placeholders hold the loaded height").toBe(before!.y)
      // Deke (#67): a Not connected card is only as tall as its content, so
      // when the answer is "not connected" the strip may shrink (the doors
      // move up), but it never grows and pushes them down.
      else expect(after!.y, "Not connected never pushes the doors down").toBeLessThanOrEqual(before!.y)
    })
  })
}

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
    test.describe(`readable Home (${vp.name} ${theme})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test(`B2: text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await page.goto("/home")
        await forceTheme(page, theme)
        const label = `${theme}/${vp.name}`
        await expectReadable(page.getByRole("heading", { level: 1, name: "Home" }), `${label}/title`, expect)
        await expectReadable(
          page.getByRole("heading", { level: 2, name: "No #1 yet" }),
          `${label}/#1`,
          expect
        )
        await expectReadable(page.getByRole("article", { name: "Subscribers" }), `${label}/subscribers`, expect)
        await expectReadable(
          page.getByRole("region", { name: "Agent Workplace" }),
          `${label}/workplace door`,
          expect
        )
      })
    })
  }
}
