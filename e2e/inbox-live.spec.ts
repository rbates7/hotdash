import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { INBOX_STATES, mockInbox, type InboxStateName } from "./support/inbox"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * The live Inbox (/api/inbox) on its two surfaces — Home's "Needs you"
 * door and the Workplace Inbox tab — in every state (mixed staleness
 * included) at 390, 820, 1180 and 1440, light and dark. e2e has no GitHub or Sentry token: "not
 * connected" is also checked against the real server; the other states mock
 * /api/inbox in the browser with invented PRs and issues. Nothing here
 * reaches GitHub or Sentry, and no sample row may appear.
 */

const door = (page: Page) => page.getByRole("region", { name: "Inbox" })
const panel = (page: Page) => page.getByTestId("inbox-panel")
const SAMPLE = /Agent blocked|Agent finished|Daily standup summary|CHLK-41\d/

/** The overall status each fixture state reads as. */
const overall = (state: InboxStateName) => (state === "empty" || state === "mixed" ? "connected" : state)

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/** What each state must show on Home's door and in the Inbox tab. */
async function expectHome(page: Page, state: InboxStateName) {
  const d = door(page)
  const busy = state === "connecting"
  await expect(d.getByTestId("needs-you-state")).toHaveAttribute("data-state", overall(state))
  if (state === "connected" || state === "stale" || state === "mixed") {
    await expect(d.getByText("3 waiting")).toBeVisible()
    // Only the rows that need the founder: never "PR needs a fix" or ongoing Sentry.
    await expect(d.getByRole("list", { name: "Needs you" }).getByRole("link")).toHaveCount(3)
    await expect(d.getByText(/needs a fix|Ongoing/)).toHaveCount(0)
    if (state === "stale")
      await expect(d.getByTestId("needs-you-updated")).toHaveText(/^GitHub: Last updated .* · Sentry: Last updated /)
    if (state === "mixed") await expect(d.getByTestId("needs-you-updated")).toHaveText(/^Sentry: Last updated \w{3}, /)
    if (state === "connected") await expect(d.getByTestId("needs-you-updated")).toHaveCount(0)
  } else {
    await expect(d.getByRole("list", { name: "Needs you" })).toHaveCount(0)
    await expect(d.getByText(/waiting/)).toHaveCount(0)
    if (busy) await expect(d.getByLabel("Connecting to GitHub and Sentry")).toHaveAttribute("aria-busy", "true")
    if (state === "empty") await expect(d.getByText("Nothing needs you")).toBeVisible()
    if (state === "not_connected") await expect(d.getByText("Not connected")).toBeVisible()
  }
  await expect(d.getByText(SAMPLE)).toHaveCount(0)
}

async function expectPanel(page: Page, state: InboxStateName) {
  const p = panel(page)
  await expect(p).toHaveAttribute("data-state", overall(state))
  const rows = p.getByRole("list", { name: "Inbox" }).getByRole("listitem")
  if (state === "connected" || state === "stale" || state === "mixed") {
    await expect(rows).toHaveCount(5)
    await expect(p.getByText("PR needs a fix · CI failing")).toBeVisible()
    await expect(p.getByText("Gmail: Not connected")).toBeVisible()
    await expect(p.getByText(/earlier/)).toHaveCount(0)
    if (state === "stale")
      await expect(p.getByTestId("inbox-updated")).toHaveText(/^GitHub: Last updated .* · Sentry: Last updated /)
    if (state === "mixed") await expect(p.getByTestId("inbox-updated")).toHaveText(/^Sentry: Last updated \w{3}, /)
  } else {
    await expect(rows).toHaveCount(0)
    if (state === "connecting") await expect(p.getByText("Connecting to GitHub and Sentry…")).toBeVisible()
    if (state === "empty") await expect(p.getByTestId("inbox-empty")).toHaveText("Nothing in the Inbox.")
    if (state === "not_connected") await expect(p.getByTestId("inbox-not-connected")).toContainText("Not connected")
  }
  await expect(p.getByText(SAMPLE)).toHaveCount(0)
}

test.describe("server endpoint with no GitHub or Sentry token", () => {
  test("/api/inbox is not_connected for every source, with no rows", async ({ request }) => {
    const res = await request.get("/api/inbox")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    const body = await res.json()
    expect(body.items).toEqual([])
    for (const id of ["github", "sentry", "gmail"]) expect(body.sources[id].status).toBe("not_connected")
  })

  test("both surfaces read Not connected from the real server", async ({ page }) => {
    await open(page, "/home")
    await expectHome(page, "not_connected")
    await open(page, "/agent-workplace?tab=inbox")
    await expectPanel(page, "not_connected")
  })

  test("our own endpoint failing reads Not connected, never an error", async ({ page }) => {
    await page.route("**/api/inbox", (route) => route.fulfill({ status: 500, body: "boom" }))
    await open(page, "/agent-workplace?tab=inbox")
    await expectPanel(page, "not_connected")
    await expect(page.getByText("boom")).toHaveCount(0)
  })
})

for (const vp of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const) {
  test.describe(`Inbox states at ${vp.width}`, () => {
    test.use({ viewport: vp })

    for (const state of Object.keys(INBOX_STATES) as InboxStateName[]) {
      test(`${state}: Home and the Inbox tab, light and dark`, async ({ page }) => {
        await mockInbox(page, INBOX_STATES[state](Date.now()))
        await open(page, "/home")
        await expectHome(page, state)
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme)
          await expectReadable(door(page), `Home Inbox door ${state} ${vp.width} (${theme})`, expect)
          expect(await pageOverflowX(page), `Home ${state} ${vp.width} ${theme}`).toBeLessThanOrEqual(1)
        }

        await open(page, "/agent-workplace?tab=inbox")
        await expectPanel(page, state)
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme)
          await expectReadable(panel(page), `Inbox tab ${state} ${vp.width} (${theme})`, expect)
          expect(await pageOverflowX(page), `Inbox ${state} ${vp.width} ${theme}`).toBeLessThanOrEqual(1)
        }
      })
    }
  })
}

test("connecting turns into the rows on the next poll", async ({ page }) => {
  let served = 0
  await page.route("**/api/inbox", async (route) => {
    served += 1
    const inbox = served <= 1 ? INBOX_STATES.connecting(Date.now()) : INBOX_STATES.connected(Date.now())
    await route.fulfill({ json: inbox, headers: { "Cache-Control": "no-store" } })
  })
  await open(page, "/agent-workplace?tab=inbox")
  await expect(panel(page)).toHaveAttribute("data-state", "connecting")
  await expect(panel(page)).toHaveAttribute("data-state", "connected", { timeout: 15_000 })
  await expect(panel(page).getByRole("list", { name: "Inbox" }).getByRole("listitem")).toHaveCount(5)
})
