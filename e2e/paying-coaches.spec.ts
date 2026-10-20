import { expect, test } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { livePaying, mockPaying } from "./support/paying"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * `GET /api/subscriptions/paying` and the Paying coaches tile on Home (#67).
 * The test server has no database URL (playwright.config.ts), so the real
 * route is not connected; the other states are mocked from fixtures.
 */
test("GET /api/subscriptions/paying: not connected without a URL, exact shape", async ({ request }) => {
  const res = await request.get("/api/subscriptions/paying")
  expect(res.status()).toBe(200)
  expect(res.headers()["cache-control"]).toContain("no-store")
  expect(await res.json()).toEqual({ status: "not_connected" })
})

test("Home: Paying coaches is Not connected with no figures", async ({ page }) => {
  await page.goto("/")
  await waitForHydration(page)
  const tile = page.getByTestId("paying-coaches")
  await expect(tile).toHaveAttribute("data-source", "not_connected")
  await expect(tile.getByTestId("not-connected")).toBeVisible()
  await expect(tile.getByTestId("paying-total")).not.toContainText(/\d/)
})

const WIDTHS = [390, 820, 1180, 1440] as const
const STATES = [
  { name: "connected", mock: () => livePaying("connected"), source: "live" },
  { name: "stale", mock: () => livePaying("stale"), source: "live" },
  { name: "connecting", mock: () => ({ status: "connecting" as const }), source: "loading" },
  { name: "not connected", mock: () => ({ status: "not_connected" as const }), source: "not_connected" },
] as const

for (const s of STATES) {
  for (const theme of ["light", "dark"] as const) {
    test(`Paying coaches ${s.name}, ${theme}: readable and no overflow at every width`, async ({ page }) => {
      await mockPaying(page, s.mock())
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("/")
        await waitForHydration(page)
        await setTheme(page, theme)
        const tile = page.getByTestId("paying-coaches")
        await expect(tile).toHaveAttribute("data-source", s.source)
        await expectReadable(tile, `${s.name}/${theme}/${width}`, expect)
        expect(await pageOverflowX(page), `page overflow ${s.name}/${theme}/${width}`).toBeLessThanOrEqual(0)
        const tileBox = (await tile.boundingBox())!
        expect(tileBox.width).toBeLessThanOrEqual(width)
        if (s.source === "live") {
          await expect(tile.getByTestId("paying-total")).toHaveText("1,000")
          for (const [label, value] of [["App Store", "40"], ["Stripe", "900"], ["Invoice", "60"]]) {
            const row = tile.locator("[data-row]").filter({ hasText: label })
            await expect(row.locator("dd")).toHaveText(value)
            // The row's label and figure stay inside the card.
            const r = (await row.boundingBox())!
            expect(r.x + r.width).toBeLessThanOrEqual(tileBox.x + tileBox.width + 0.5)
          }
          if (s.name === "stale") await expect(tile.getByTestId("paying-updated")).toHaveText(/^Last updated /)
          else await expect(tile.getByTestId("paying-updated")).toHaveCount(0)
        }
      }
    })
  }
}

test("KPI row (Deke, #67): three even columns from 1024px; below that Paying coaches spans the row", async ({ page }) => {
  for (const width of [820, 1024, 1180, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/")
    await waitForHydration(page)
    const strip = page.getByRole("region", { name: "KPI strip" })
    const cards = strip.getByRole("article")
    const first = (await cards.nth(0).boundingBox())!
    const second = (await cards.nth(1).boundingBox())!
    const tile = (await cards.nth(2).boundingBox())!
    if (width >= 1024) {
      expect(Math.abs(tile.y - first.y), `one row at ${width}`).toBeLessThanOrEqual(1)
      expect(Math.abs(tile.width - first.width), `even columns at ${width}`).toBeLessThanOrEqual(1)
      expect(Math.abs(second.width - first.width), `even columns at ${width}`).toBeLessThanOrEqual(1)
    } else expect(Math.abs(tile.x + tile.width - (second.x + second.width)), `full row at ${width}`).toBeLessThanOrEqual(1)
  }
})

test("Not connected cards are only as tall as their content at 390 (Deke, #67)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await waitForHydration(page)
  const cards = page.getByRole("region", { name: "KPI strip" }).getByRole("article")
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute("data-source", "not_connected")
    // Header, dash and one muted line: well under the old 124px minimum plus reserves.
    expect((await card.boundingBox())!.height).toBeLessThan(124)
  }
})

for (const [width, cols] of [[390, 1], [820, 2]] as const) {
  test(`live tile at ${width}: the methods are ${cols} column(s), never 3 (Deke, #67)`, async ({ page }) => {
    await mockPaying(page, livePaying("connected"))
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1180 })
    await page.goto("/")
    await waitForHydration(page)
    const dl = page.getByTestId("paying-breakdown")
    const boxes = await Promise.all((await dl.locator("[data-row]").all()).map(async (r) => (await r.boundingBox())!))
    expect(new Set(boxes.map((b) => Math.round(b.x))).size).toBe(cols)
    expect((await dl.boundingBox())!.width).toBeLessThanOrEqual(421)
  })
}
