import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"

/**
 * #62 r1 B2: seven Workplace tabs do not fit at 390, so the bar scrolls.
 * Every tab must be reachable and activatable (pointer and keyboard), the
 * active tab must sit fully inside the visible bar on load and on change,
 * and the edge fades say which side has more tabs. Targets stay 44px.
 */
const TABS = ["Issues", "Backlog", "Work board", "Agents", "Chat", "Autopilots", "Inbox"] as const

test.use({ viewport: { width: 390, height: 844 } })

const tablist = (page: Page) => page.getByRole("tablist").first()
const bar = (page: Page) => page.getByTestId("workplace-tab-bar")

/** The tab's box lies inside the tablist's visible box (it is not clipped by the scroller). */
async function expectFullyInBar(page: Page, name: string) {
  const tab = tablist(page).getByRole("tab", { name, exact: true })
  await expect(tab).toHaveAttribute("aria-selected", "true")
  await expect
    .poll(async () => {
      const [t, l] = await Promise.all([tab.boundingBox(), tablist(page).boundingBox()])
      return Boolean(t && l && t.x >= l.x - 1 && t.x + t.width <= l.x + l.width + 1)
    }, { message: `${name} fully visible in the bar` })
    .toBe(true)
}

test("the bar scrolls and shows an end fade at the start; every tab is a 44px target", async ({ page }) => {
  await page.goto("/agent-workplace")
  await waitForHydration(page)
  const sizes = await tablist(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(sizes.scroll, "seven tabs overflow at 390").toBeGreaterThan(sizes.client)
  await expect(bar(page)).toHaveAttribute("data-fade-end", "")
  await expect(bar(page)).not.toHaveAttribute("data-fade-start", "")
  for (const name of TABS) {
    const tab = tablist(page).getByRole("tab", { name, exact: true })
    await tab.scrollIntoViewIfNeeded()
    await expectTapTarget(tab, name)
  }
  // No page overflow from the bar.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})

test("every tab can be reached and activated by tap, and the active tab is in view", async ({ page }) => {
  await page.goto("/agent-workplace")
  await waitForHydration(page)
  for (const name of TABS) {
    await tablist(page).getByRole("tab", { name, exact: true }).click()
    await expectFullyInBar(page, name)
    await expect(page.getByRole("tabpanel", { name, exact: true })).toBeVisible()
  }
  // At the far end the start fade shows instead.
  await expect(bar(page)).toHaveAttribute("data-fade-start", "")
})

test("keyboard: arrows reach every tab, Enter activates it, and it scrolls into view", async ({ page }) => {
  await page.goto("/agent-workplace")
  await waitForHydration(page)
  await tablist(page).getByRole("tab", { name: "Issues", exact: true }).focus()
  for (const name of TABS.slice(1)) {
    await page.keyboard.press("ArrowRight")
    await expect(tablist(page).getByRole("tab", { name, exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expectFullyInBar(page, name)
  }
  await page.keyboard.press("ArrowLeft")
  await expect(tablist(page).getByRole("tab", { name: "Autopilots", exact: true })).toBeFocused()
})

for (const name of ["Inbox", "Autopilots", "Work board"] as const) {
  test(`a deep link to ${name} loads with ${name} in view`, async ({ page }) => {
    const value = { Inbox: "inbox", Autopilots: "autopilots", "Work board": "workboard" }[name]
    await page.goto(`/agent-workplace?tab=${value}`)
    await waitForHydration(page)
    await expectFullyInBar(page, name)
  })
}
