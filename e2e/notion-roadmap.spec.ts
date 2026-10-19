import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { LIVE_ROADMAP, liveRoadmapSummary, mockNotion } from "./support/notion"
import { NOTE, persistenceNote } from "./support/persistence"
import { CONNECTING_COPY, NOT_CONNECTED_COPY } from "./support/roadmap"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * The Roadmap from Notion, four states, on the Roadmap and Settings. e2e
 * never has a Notion token: "not connected" is the real server without
 * one; "connecting", "connected" and "stale" mock /api/notion/roadmap in
 * the browser. Nothing here reaches Notion.
 */

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true })
const titlesIn = (page: Page, name: string) =>
  column(page, name)
    .getByRole("article")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))
const sourceNote = (page: Page) => header(page).getByRole("status", { name: "Where the roadmap comes from" })
const notConnected = (page: Page) => main(page).getByRole("note", { name: "Notion not connected", exact: true })
const CONNECTING = { status: "connecting", lastSyncedAt: null, roadmap: null } as const
const notionRow = (page: Page) =>
  main(page).getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "Notion" })

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/* ---------------------------------------------------- the real endpoints */

test.describe("server endpoints with no Notion token", () => {
  test("/api/notion/roadmap is not_connected — no rows, no error text", async ({ request }) => {
    const res = await request.get("/api/notion/roadmap")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null, roadmap: null })
  })

  test("/api/health/notion says only not_configured", async ({ request }) => {
    const res = await request.get("/api/health/notion")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.text()).toBe('{"notion":"not_configured"}')
  })
})

/* ------------------------------------------------------- not connected */

test.describe("Notion not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Roadmap: says Not connected and shows no bets (no sample board); this browser's board stays editable", async ({ page }) => {
    await open(page, "/product-roadmap")
    await page.evaluate(() => localStorage.removeItem("hotdash.product-roadmap.v1"))
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(notConnected(page)).toHaveText(`Not connected. ${NOT_CONNECTED_COPY}`)
    await expect(main(page).getByRole("article")).toHaveCount(0)
    await expect(main(page).getByText("Flag Football 2026")).toHaveCount(0)
    await expect(main(page).getByRole("note", { name: "Sample data", exact: true })).toHaveCount(0)
    await expect(header(page).getByTestId("sample-data-badge")).toHaveCount(0)
    await expect(main(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(sourceNote(page)).toHaveCount(0)
    await expect(header(page).getByRole("button", { name: "New bet", exact: true })).toBeEnabled()
  })

  test("Settings: Notion says Not connected", async ({ page }) => {
    await open(page, "/settings")
    await expect(notionRow(page)).toContainText("Product Roadmap")
    await expect(notionRow(page)).toContainText("Not connected")
  })
})

/* ----------------------------------------------------------- connecting */

test.describe("Notion connecting (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Roadmap: skeleton and Connecting to Notion…, never sample bets or Not connected; New bet off", async ({ page }) => {
    await mockNotion(page, CONNECTING)
    await open(page, "/product-roadmap")
    await expect(main(page).getByTestId("notion-connecting")).toHaveText(CONNECTING_COPY)
    await expect(main(page).getByRole("status", { name: "Loading saved bets" })).toBeVisible()
    await expect(main(page).getByRole("article")).toHaveCount(0)
    await expect(notConnected(page)).toHaveCount(0)
    await expect(main(page).getByTestId("sample-data-notice")).toHaveCount(0)
    await expect(persistenceNote(page)).toHaveCount(0)
    await expect(header(page).getByRole("button", { name: "New bet", exact: true })).toBeDisabled()
  })

  test("Roadmap: Notion's rows replace the skeleton once the first sync lands", async ({ page }) => {
    let summary: typeof CONNECTING | ReturnType<typeof liveRoadmapSummary> = CONNECTING
    await mockNotion(page, () => summary)
    await open(page, "/product-roadmap")
    await expect(main(page).getByTestId("notion-connecting")).toBeVisible()
    summary = liveRoadmapSummary("connected")
    // Polled every 5 s while connecting.
    await expect(card(page, "Coach onboarding v2")).toBeVisible({ timeout: 15_000 })
    await expect(main(page).getByTestId("notion-connecting")).toHaveCount(0)
  })

  test("Settings: Notion says Connecting…", async ({ page }) => {
    await mockNotion(page, CONNECTING)
    await open(page, "/settings")
    await expect(notionRow(page).getByTestId("notion-status")).toHaveText("Connecting…")
    await expect(notionRow(page).getByTestId("notion-detail")).toHaveText(
      "Read-only token found · first sync in progress, the Roadmap appears when it finishes"
    )
    const sampleSection = main(page).getByRole("region", { name: "Sample data" })
    await expect(sampleSection).toContainText(
      "Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then. Home and Metrics show no invented figures"
    )
    await expect(sampleSection).not.toContainText("Every number on every screen")
  })
})

/* ------------------------------------------------------------ connected */

test.describe("Notion connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Roadmap: Notion's rows in the same board, no Sample label, read-only", async ({ page }) => {
    await mockNotion(page, liveRoadmapSummary("connected"))
    await open(page, "/product-roadmap")
    await expect(card(page, "Coach onboarding v2")).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Coach onboarding v2", "Shared playbooks"])
    expect(await titlesIn(page, "Next")).toEqual(["Season recap export"])
    expect(await titlesIn(page, "Later")).toEqual(["Android tablet app"])
    await expect(main(page).getByTestId("sample-data-notice")).toHaveCount(0)
    await expect(main(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(header(page).getByTestId("sample-data-badge")).toHaveCount(0)
    await expect(main(page).getByText("Flag Football 2026")).toHaveCount(0)

    await expect(sourceNote(page)).toHaveText("Read-only · from Notion")
    await expect(header(page).getByRole("button", { name: "Reset", exact: true })).toHaveCount(0)
    await expect(header(page).getByRole("button", { name: "New bet", exact: true })).toBeDisabled()
    const shared = card(page, "Shared playbooks")
    await expect(shared).toContainText("Mace")
    await expect(shared).toContainText("Nov 2026")
    await expect(shared).toContainText("From Feature Request")
    await expect(shared.getByRole("button", { name: "Edit", exact: true })).toBeDisabled()
    await expect(shared.getByRole("button", { name: "Move to Next" })).toBeDisabled()
  })

  test("Roadmap: this browser's saved edits are left alone while Notion is shown", async ({ page }) => {
    await open(page, "/product-roadmap")
    const saved = JSON.stringify({ items: [], nextId: 1 })
    await page.evaluate((v) => localStorage.setItem("hotdash.product-roadmap.v1", v), saved)
    await mockNotion(page, liveRoadmapSummary("connected"))
    await page.reload()
    await expect(card(page, "Coach onboarding v2")).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem("hotdash.product-roadmap.v1"))).toBe(saved)
  })

  test("Settings: Notion Connected, with the last sync on the shared clock", async ({ page }) => {
    await mockNotion(page, liveRoadmapSummary("connected"))
    await open(page, "/settings")
    await expect(notionRow(page).getByTestId("notion-status")).toHaveText("Connected")
    await expect(notionRow(page).getByTestId("notion-detail")).toHaveText("Read-only · last synced Wed, Oct 14 · 9:41 AM CDT")
  })
})

/* ---------------------------------------------------------------- stale */

test.describe("Notion stale (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Roadmap: the last rows, unlabelled, with Last updated", async ({ page }) => {
    await mockNotion(page, liveRoadmapSummary("stale"))
    await open(page, "/product-roadmap")
    await expect(card(page, "Coach onboarding v2")).toBeVisible()
    await expect(sourceNote(page)).toHaveText("Last updated Wed, Oct 14 · 9:41 AM CDT")
    await expect(main(page).getByTestId("sample-data-notice")).toHaveCount(0)
  })

  test("Settings: Notion shows Last updated <time>", async ({ page }) => {
    await mockNotion(page, liveRoadmapSummary("stale"))
    await open(page, "/settings")
    await expect(notionRow(page).getByTestId("notion-status")).toHaveText("Last updated Wed, Oct 14 · 9:41 AM CDT")
  })

  test("our endpoint failing before any rows reads as Not connected — never an error or sample bets", async ({ page }) => {
    await mockNotion(page, () => null)
    await open(page, "/product-roadmap")
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(notConnected(page)).toBeVisible()
    await expect(main(page).getByText("Flag Football 2026")).toHaveCount(0)
    await expect(main(page).getByText(/error/i)).toHaveCount(0)
  })
})

/* ------------------------------------------------------------ responsive */

for (const vp of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`Notion connected at ${vp.width} ${theme}`, () => {
      test.use({ viewport: vp })

      test("read-only board: readable, no sideways scroll, counts from Notion", async ({ page }) => {
        await mockNotion(page, liveRoadmapSummary("stale", { ...LIVE_ROADMAP, unplaced: 2 }))
        await open(page, "/product-roadmap")
        await setTheme(page, theme)
        await expect(page.getByRole("article").first()).toBeVisible()
        await expect(main(page).getByTestId("notion-unplaced-notice")).toContainText("2 rows in Notion")
        await expect(page.getByRole("group", { name: "Filter by column" })).toContainText("Now2")
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
        // Disabled controls are exempt from contrast (WCAG 1.4.3); the words are not.
        const label = `${theme}/${vp.width}`
        await expectReadable(sourceNote(page), `${label} source note`, expect)
        await expectReadable(main(page).getByTestId("notion-unplaced-notice"), `${label} unplaced notice`, expect)
        await expectReadable(page.getByRole("article").first().locator("h3"), `${label} card title`, expect)
        await expectReadable(page.getByRole("article").first().locator("p"), `${label} card why`, expect)
      })
    })
  }
}
