import { expect, test, type Page } from "@playwright/test"

import { FOUNDER_NAME } from "../src/components/founder-identity"
import { TICKER_HREF } from "../src/components/home/subscriber-ticker"
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/lib/settings"
import { SAMPLE_CADENCE_MS, sampleBase } from "../src/lib/subscriber-source"
import { formatCount, tickerLabel } from "../src/lib/subscriber-ticker"
import { expectReadable } from "./support/contrast"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"
import { mockStripe, withSubscribers } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * The Home subscriber ticker (option A). With no Stripe key (e2e never has
 * one) it shows the sample source, which adds a simulated sign-up every
 * 20s; tests that watch a change drive it with Playwright's clock so
 * nothing waits on wall time. Live counts come from a mocked
 * /api/stripe/summary.
 */

const BASE = sampleBase(new Date())

/** The ticker on screen: the Home header copy from md, the top-bar copy on phone. */
function ticker(page: Page) {
  return page.getByTestId("subscriber-ticker").filter({ visible: true })
}

function status(page: Page) {
  return ticker(page).getByRole("status")
}

/** What the live region says: its one sr-only text (no aria-label). */
function spoken(page: Page) {
  return status(page).locator(".sr-only")
}

/** Ticker live regions exposed and painted: exactly one per breakpoint. */
async function visibleStatuses(page: Page) {
  return page.getByTestId("subscriber-ticker").getByRole("status").filter({ visible: true }).count()
}

/** Advance the fake clock until the label moves off `from`. */
async function runUntilChange(page: Page, from: string) {
  await page.clock.runFor(SAMPLE_CADENCE_MS - 1_000)
  for (let i = 0; i < 400; i++) {
    if ((await spoken(page).textContent()) !== from) return
    await page.clock.runFor(10)
  }
  throw new Error(`ticker never left "${from}"`)
}

test.describe("Home ticker (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("renders top-right on Home with the Sample label and an accessible label", async ({ page }) => {
    await page.clock.install()
    await page.goto("/home")
    await waitForHydration(page)

    const t = ticker(page)
    await expect(t).toHaveCount(1)
    await expect(t).toHaveAttribute("data-variant", "header")
    const label = tickerLabel(BASE, 0)
    await expect(spoken(page)).toHaveText(label)
    await expect(status(page)).not.toHaveAttribute("aria-label")
    expect(await visibleStatuses(page)).toBe(1)
    await expect(status(page)).toHaveAttribute("aria-live", "polite")
    await expect(status(page)).toHaveAttribute("aria-busy", "false")
    await expect(t.getByTestId("ticker-tiles")).toHaveAttribute("aria-hidden", "true")
    await expect(t.getByText("Subscribers", { exact: true })).toBeVisible()
    await expect(t.getByTestId("sample-data-tag")).toHaveText("Sample data")

    // Option A: top-right of the Home header, right of the title.
    const title = await page.getByRole("heading", { level: 1, name: "Home" }).boundingBox()
    const box = await t.boundingBox()
    const main = await page.getByRole("main").boundingBox()
    expect(box!.x).toBeGreaterThan(title!.x + title!.width)
    expect(main!.x + main!.width - (box!.x + box!.width), "ticker hugs the right edge").toBeLessThan(40)
    expect(Math.abs(box!.y - title!.y), "ticker on the title row").toBeLessThan(20)

    // Tiles are tabular Geist Mono.
    const font = await t.locator("[data-tile] > span > span").first().evaluate((el) => {
      const s = getComputedStyle(el)
      return { family: s.fontFamily, weight: s.fontWeight, numeric: s.fontVariantNumeric }
    })
    expect(font.family).toMatch(/Geist Mono/i)
    expect(font.weight).toBe("600")
    expect(font.numeric).toContain("tabular-nums")

    // Click → Metrics › New Subscribers.
    const link = t.getByRole("link", { name: label })
    await expect(link).toHaveAttribute("href", TICKER_HREF)
    // Named once: the link by its label, the live region by its text.
    await expect(status(page)).toHaveAccessibleName("")
    await link.click()
    await expect(page).toHaveURL(/\/metrics\?tab=new$/)
    await expect(page.getByRole("tab", { name: "New Subscribers" })).toHaveAttribute("aria-selected", "true")
  })

  test("flips only on a change, never on first paint, and lands on the new figure", async ({ page }) => {
    await page.clock.install()
    await page.goto("/home")
    await waitForHydration(page)
    const tiles = ticker(page).getByTestId("ticker-tiles")
    await expect(tiles.locator("[data-flap]")).toHaveCount(0)

    await runUntilChange(page, tickerLabel(BASE, 0))
    // Let the ones tile start its first flap (its delay is 0).
    await page.clock.runFor(5)
    // The flap is on screen until the fake clock lets it land.
    await expect(tiles.locator("[data-flap]")).toHaveCount(2)
    await page.clock.runFor(1_000)
    await expect(tiles.locator("[data-flap]")).toHaveCount(0)
    await expect(spoken(page)).toHaveText(tickerLabel(BASE + 1, 1))
    await expect(ticker(page).getByText("+1")).toBeVisible()
  })

  test("reduced motion: the number updates with no flaps or rotations, only an opacity crossfade", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.clock.install()
    await page.goto("/home")
    await waitForHydration(page)
    const t = ticker(page)
    const tiles = t.getByTestId("ticker-tiles")
    await expect(spoken(page)).toHaveText(tickerLabel(BASE, 0))

    const watch = () =>
      tiles.evaluate((root) => ({
        flaps: root.querySelectorAll("[data-flap]").length,
        // Any 3D/rotating transform on any element in the tiles.
        rotated: [...root.querySelectorAll("*")].filter((el) => {
          const tf = getComputedStyle(el).transform
          if (tf === "none") return false
          if (tf.startsWith("matrix3d")) return true
          const [, b, c] = tf.slice(7, -1).split(",").map(Number)
          return b !== 0 || c !== 0
        }).length,
        animations: root
          .getAnimations({ subtree: true })
          .map((a) => (a as CSSAnimation).animationName ?? "transition"),
      }))

    await runUntilChange(page, tickerLabel(BASE, 0))
    const during = await watch()
    expect(during.flaps).toBe(0)
    expect(during.rotated).toBe(0)
    for (const name of during.animations) expect(name).toMatch(/^ticker-fade-(in|out)$/)

    await page.clock.runFor(1_000)
    const after = await watch()
    expect(after.flaps).toBe(0)
    expect(after.rotated).toBe(0)
    await expect(spoken(page)).toHaveText(tickerLabel(BASE + 1, 1))
    await expect(tiles).toHaveText(
      formatCount(BASE + 1)
        .split("")
        .map((c) => (/\d/.test(c) ? c + c : c))
        .join("")
    )
  })

  test("Settings › Sample data off hides the label, not the number", async ({ page }) => {
    await page.addInitScript(
      ([key, settings]) => localStorage.setItem(key, settings),
      [SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, sampleData: false })] as const
    )
    await page.goto("/home")
    await waitForHydration(page)
    // Like every other Home sample surface: the chips go…
    await expect(page.getByRole("region", { name: "KPI strip" }).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(ticker(page).getByTestId("sample-data-tag")).toHaveCount(0)
    // …and the figures stay.
    await expect(spoken(page)).toHaveText(tickerLabel(BASE, 0))
  })

  test("is Home-only", async ({ page }) => {
    await page.goto("/metrics")
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expect(page.getByTestId("subscriber-ticker")).toHaveCount(0)
  })
})

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, variant: "bar" },
  { name: "820", width: 820, height: 1180, variant: "header" },
  { name: "1180", width: 1180, height: 820, variant: "header" },
] as const

for (const vp of VIEWPORTS) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`Home ticker (${vp.name} ${theme})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      test("44px target and readable text", async ({ page }) => {
        await page.goto("/home")
        await waitForHydration(page)
        await setTheme(page, theme)
        const t = ticker(page)
        await expect(t).toHaveCount(1)
        await expect(t).toHaveAttribute("data-variant", vp.variant)
        await expect(spoken(page)).toHaveText(tickerLabel(BASE, 0))
        await expect(t.getByTestId("sample-data-tag")).toBeVisible()
        await expectTapTarget(t.getByRole("link"), `${theme}/${vp.name} ticker link`)
        await expectReadable(t, `${theme}/${vp.name} ticker`, expect)

        // Figma 31:220, identical in both themes: #131313, no border.
        const tile = await t.locator("[data-tile]").first().evaluate((el) => {
          const s = getComputedStyle(el)
          return { bg: s.backgroundColor, color: s.color, border: s.borderTopWidth, radius: s.borderTopLeftRadius }
        })
        expect(tile.bg).toBe("rgb(19, 19, 19)")
        expect(tile.color).toBe("rgb(244, 244, 241)")
        expect(tile.border, "no border").toBe("0px")
        expect(tile.radius).toBe(vp.variant === "header" ? "3px" : "2px")
      })
    })
  }
}

test.describe("Home ticker (390 phone bar)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("sits in the top bar without crowding it; nothing scrolls sideways", async ({ page }) => {
    await page.goto("/home")
    await waitForHydration(page)
    const bar = page.locator("[data-slot='app-header']")
    const t = ticker(page)
    await expect(bar.getByTestId("subscriber-ticker")).toBeVisible()
    await expect(t).toHaveCount(1)

    // Founder name is not truncated and nothing in the bar overlaps.
    const name = bar.getByText(FOUNDER_NAME, { exact: true })
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const nameBox = (await name.boundingBox())!
    const tBox = (await t.boundingBox())!
    const toggle = (await bar.getByRole("button", { name: /Switch to (light|dark) theme/ }).boundingBox())!
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(tBox.x + 1)
    expect(tBox.x + tBox.width).toBeLessThanOrEqual(toggle.x + 1)
    await expectTapTarget(bar.getByRole("button", { name: /Switch to (light|dark) theme/ }), "theme toggle")
    await expectTapTarget(bar.getByRole("button", { name: "Open menu" }), "menu")

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    // One live region: the bar's (the header copy is display:none).
    expect(await visibleStatuses(page)).toBe(1)
    // The Home header itself keeps everything it had.
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
    await expect(page.getByTestId("persistence-note")).toBeVisible()
    await expect(page.getByText("Dummy / design mock", { exact: true })).toBeVisible()
  })
})

test.describe("Home ticker (360 dark, 5 digits)", () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test("99,999 fits the phone bar: no sideways scroll, no clipped name, 44px targets, no overlap", async ({
    page,
  }) => {
    // Stripe (mocked in the browser) reports a 5-digit count.
    await mockStripe(page, withSubscribers(99_999))
    await page.goto("/home")
    await waitForHydration(page)
    await setTheme(page, "dark")
    const bar = page.locator("[data-slot='app-header']")
    const t = ticker(page)
    await expect(spoken(page)).toHaveText(tickerLabel(99_999, 0))
    await expect(t.locator("[data-flap]")).toHaveCount(0)
    await expect(t.getByTestId("ticker-tiles")).toHaveText("9999,999999") // no compact "K"

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    const name = bar.getByText(FOUNDER_NAME, { exact: true })
    await expect(name).toBeVisible()
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth), "founder name not clipped").toBe(true)

    const link = t.getByRole("link")
    const toggle = bar.getByRole("button", { name: /Switch to (light|dark) theme/ })
    const menu = bar.getByRole("button", { name: "Open menu" })
    await expectTapTarget(toggle, "theme toggle")
    await expectTapTarget(link, "ticker link")

    const boxes = {
      name: (await name.boundingBox())!,
      ticker: (await t.boundingBox())!,
      toggle: (await toggle.boundingBox())!,
      menu: (await menu.boundingBox())!,
    }
    const entries = Object.entries(boxes)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [an, a] = entries[i]
        const [bn, b] = entries[j]
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(overlapX > 0.5 && overlapY > 0.5, `${an} overlaps ${bn}`).toBe(false)
      }
    }
    for (const [n, b] of entries) {
      expect(b.x, `${n} inside the viewport`).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width, `${n} inside the viewport`).toBeLessThanOrEqual(360 + 0.5)
    }
  })
})
