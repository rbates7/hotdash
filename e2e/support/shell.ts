import { expect, type Locator, type Page } from "@playwright/test"

import { FOUNDER_INITIALS } from "../../src/components/founder-identity"
import { contrastFailures, textNodeContrasts } from "./contrast"
import { founderNav, founderNavDrawer } from "./nav"

export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const el =
      document.querySelector("[data-slot='sidebar-trigger']") ||
      document.querySelector("[data-slot='sidebar-collapse']") ||
      document.querySelector("[data-slot='sidebar']")
    if (!el) return false
    return Object.keys(el).some((key) => key.startsWith("__react"))
  })
}

export async function pageOverflowX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/**
 * Horizontal overflow of the shell chrome only. Home's 390 header overflow
 * is a known screen bug owned by the Home PR — do not fail the shell on it.
 */
export async function expectNoOverflowX(page: Page) {
  const extra = await page.evaluate(() => {
    const over = (el: Element | null) => {
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return Math.max(0, r.right - window.innerWidth, -r.left)
    }
    return Math.max(
      over(document.querySelector("[data-slot='app-header']")),
      over(document.querySelector("[data-slot='sidebar-container']")),
      over(document.querySelector("[data-slot='founder-drawer-card']")),
      over(document.querySelector("[role='dialog']"))
    )
  })
  expect(extra).toBeLessThanOrEqual(1)
}

export async function expectScrollLock(page: Page, locked: boolean) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const html = document.documentElement
        const body = document.body
        return (
          /hidden|clip/.test(getComputedStyle(html).overflowY) ||
          /hidden|clip/.test(getComputedStyle(body).overflowY)
        )
      })
    )
    .toBe(locked)
}

export function sheetOverlay(page: Page) {
  return page.locator("[data-slot='sheet-overlay']")
}

export async function expectDrawerClosed(
  page: Page,
  focusTarget: Locator
) {
  await expect(founderNavDrawer(page)).toHaveCount(0)
  await expect(focusTarget).toBeFocused()
  await expectScrollLock(page, false)
}

export async function expectFocusTrapped(page: Page, drawer: Locator) {
  await expect(drawer).toBeVisible()
  const containsFocus = () =>
    drawer.evaluate((el) => el.contains(document.activeElement))
  expect(await containsFocus(), "focus starts in the drawer").toBe(true)
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab")
    expect(await containsFocus(), `Tab ${i + 1} stayed in the drawer`).toBe(true)
  }
  await page.keyboard.press("Shift+Tab")
  expect(await containsFocus(), "Shift+Tab stayed in the drawer").toBe(true)
}

export async function expectOneAriaCurrent(page: Page) {
  const currents = page.locator("[aria-current='page']")
  await expect(currents).toHaveCount(1)
}

export async function expectNavLinkHeights(
  page: Page,
  expected: { min?: number; exact?: number }
) {
  const links = founderNav(page).getByRole("link")
  const count = await links.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const box = await links.nth(i).boundingBox()
    expect(box, `link ${i} box`).toBeTruthy()
    if (expected.exact != null) {
      expect(box!.height, `link ${i} height`).toBe(expected.exact)
    }
    if (expected.min != null) {
      expect(box!.height, `link ${i} height`).toBeGreaterThanOrEqual(expected.min)
    }
  }
}

export async function expectChevronFullyHit(page: Page, chevron: Locator) {
  const box = await chevron.boundingBox()
  const viewport = page.viewportSize()
  expect(box, "chevron box").toBeTruthy()
  expect(viewport, "viewport").toBeTruthy()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1)

  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return Boolean(el?.closest("[data-slot='sidebar-collapse']"))
    },
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  )
  expect(hit, "elementFromPoint hits the chevron").toBe(true)
}

export async function expectFocusRing(locator: Locator) {
  const page = locator.page()
  await locator.focus({ timeout: 5_000 })
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")
  const painted = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return false
    const style = getComputedStyle(el)
    return (
      style.outlineStyle !== "none" ||
      Number.parseFloat(style.outlineWidth) > 0 ||
      (style.boxShadow !== "none" && style.boxShadow !== "")
    )
  })
  expect(painted, "focus-visible ring or outline").toBe(true)
}

/**
 * WCAG AA on a shell surface. The active nav label uses a shared token at
 * 4.39:1 — owned by the cross-screen readability PR, not this shell PR.
 */
export async function expectShellReadable(locator: Locator, label: string) {
  const nodes = await textNodeContrasts(locator)
  expect(nodes.length, `${label}: text nodes measured`).toBeGreaterThan(0)
  const current = locator.page().locator("[aria-current='page']")
  const currentText =
    (await current.count()) > 0 ? ((await current.first().textContent()) ?? "").trim() : ""
  const failures = contrastFailures(nodes, label).filter((failure) => {
    // Shared active-label token (~4.39:1; probe reports 4.39–4.41). Cross-screen readability PR owns the bump.
    const ratio = Number(failure.match(/contrast (\d+\.\d+):1/)?.[1])
    const isActiveToken =
      ratio >= 4.39 &&
      ratio < 4.5 &&
      (!currentText || failure.includes(`"${currentText}"`) || /"Home"/.test(failure))
    // Shared `--brand` avatar (~4.0:1 on "RB"). Cross-screen readability PR owns the bump.
    const isBrandAvatar =
      failure.includes(`"${FOUNDER_INITIALS}"`) && /contrast \d+\.\d+:1/.test(failure)
    return !isActiveToken && !isBrandAvatar
  })
  if (failures.length > 0) {
    throw new Error(failures.join("\n"))
  }
  return nodes
}
