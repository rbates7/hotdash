import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { waitForHydration } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"
import { setTheme } from "./support/theme"
import { LIVE_ITEMS, WORKBOARD_URL, mockWorkboard, workboardSummary } from "./support/workboard"

/**
 * The Work board tab reads GET /api/workboard (#51). The e2e server has no
 * GitHub token, so unmocked it is Not connected; the other states mock the
 * route in the browser. Never a sample card (Rashad's Oct 16 rule).
 */

async function open(page: Page) {
  await page.goto(WORKBOARD_URL)
  await waitForHydration(page)
  await expect(page.getByRole("tab", { name: "Work board" })).toHaveAttribute("aria-selected", "true")
}

const board = (page: Page) => page.getByRole("tabpanel", { name: "Work board" })

test("Not connected from the real route (no token), no cards", async ({ page }) => {
  await open(page)
  const panel = board(page).getByRole("region", { name: "Work board: not connected" })
  await expect(panel.getByTestId("not-connected")).toHaveText("Not connected")
  await expect(board(page).getByTestId("work-card")).toHaveCount(0)
})

test("Connecting… while the server's first sync runs, no cards", async ({ page }) => {
  await mockWorkboard(page, workboardSummary("connecting"))
  await open(page)
  const panel = board(page).getByRole("region", { name: "Work board: connecting" })
  await expect(panel).toHaveAttribute("aria-busy", "true")
  await expect(panel.getByTestId("workboard-connecting-badge")).toHaveText("Connecting…")
  await expect(board(page).getByTestId("work-card")).toHaveCount(0)
})

test("connecting turns into live rows on a later poll", async ({ page }) => {
  let answer = workboardSummary("connecting")
  await mockWorkboard(page, () => answer)
  await open(page)
  await expect(board(page).getByTestId("workboard-connecting")).toBeVisible()
  const region = board(page).getByRole("status")
  await expect(region).toHaveCount(1)
  await expect(region).toHaveAttribute("aria-live", "polite")
  await expect(region).toHaveText("Work board: Connecting…")
  const node = await region.elementHandle()
  answer = workboardSummary("connected")
  await expect(board(page).getByTestId("work-card")).toHaveCount(LIVE_ITEMS.length, { timeout: 15_000 })
  // The same polite region, now saying how many PRs and when.
  await expect(region).toHaveText(/^Work board: 4 PRs updated Oct 16, 7:45\sPM CDT$/)
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true)
  expect(await node!.textContent()).toMatch(/^Work board: 4 PRs updated/)
})

test("connected and empty: No open pull requests", async ({ page }) => {
  await mockWorkboard(page, workboardSummary("connected", []))
  await open(page)
  await expect(board(page).getByRole("region", { name: "Work board: no open pull requests" })).toContainText("No open pull requests")
  await expect(board(page).getByTestId("work-card")).toHaveCount(0)
})

test("live rows sit in their columns with 44px links on tablet", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await mockWorkboard(page, workboardSummary("connected"))
  await open(page)
  await expect(board(page).getByTestId("work-card")).toHaveCount(LIVE_ITEMS.length)
  for (const [name, n] of [["Working", 52], ["Needs fix", 50], ["Ready for review", 48], ["Merged", 46]] as const) {
    const link = board(page).getByRole("region", { name, exact: true }).getByRole("link", { name: `PR #${n}` })
    await expect(link).toHaveAttribute("href", `https://github.com/rbates7/hotdash/pull/${n}`)
    await expectTapTarget(link, `PR #${n}`)
  }
  await expectTapTarget(board(page).getByRole("link", { name: "Proof" }), "Proof")
  await expect(board(page).getByTestId("workboard-stale")).toHaveCount(0)
})

for (const theme of ["light", "dark"] as const) {
  test(`CI and review badges carry their tone and clear 4.5:1 (${theme})`, async ({ page }) => {
    await mockWorkboard(page, workboardSummary("connected"))
    await open(page)
    await setTheme(page, theme)
    const color = (text: string) => board(page).getByText(text, { exact: true }).evaluate((el) => getComputedStyle(el).color)
    const title = await board(page).getByText("Connecting state", { exact: true }).evaluate((el) => getComputedStyle(el).color)
    const failing = await color("CI failing")
    const pending = await color("CI pending")
    // Not the neutral outline colour: red and amber, and not the same.
    expect(failing).not.toBe(title)
    expect(pending).not.toBe(title)
    expect(failing).not.toBe(pending)
    expect(await color("Changes requested")).toBe(failing)
    for (const id of ["work-ci", "work-review"]) {
      const badges = board(page).getByTestId(id)
      for (let i = 0; i < (await badges.count()); i++) await expectReadable(badges.nth(i), `${id} ${i} ${theme}`, expect)
    }
  })
}

test("stale: last good rows under the stale note", async ({ page }) => {
  await mockWorkboard(page, workboardSummary("stale"))
  await open(page)
  await expect(board(page).getByTestId("workboard-stale")).toContainText("GitHub could not be read just now")
  await expect(board(page).getByTestId("work-card")).toHaveCount(LIVE_ITEMS.length)
})

test("our endpoint down from the start reads as Not connected, never an empty board", async ({ page }) => {
  await mockWorkboard(page, null)
  await open(page)
  await expect(board(page).getByTestId("workboard-not-connected")).toBeVisible()
  await expect(board(page).getByTestId("workboard-empty")).toHaveCount(0)
})

test("no Engineering playbook link on the page (not approved for a public page)", async ({ page }) => {
  await page.goto("/agent-workplace")
  await waitForHydration(page)
  await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Engineering playbook" })).toHaveCount(0)
  await expect(page.locator('a[href*="notion.com"]')).toHaveCount(0)
})
