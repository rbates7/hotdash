import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"

const STATUSES = ["To Do", "In Progress", "In Review", "Done", "Blocked"] as const

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

/** Document overflow — not window.scrollX, which overflow clipping can fake. */
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

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme)
}

async function expectBoardScrollsInternally(page: Page, label: string) {
  const board = page.getByTestId("workplace-board")
  await expect(board, `${label}: board`).toBeVisible()
  const before = await board.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(before.scrollWidth, `${label}: track wider than scroller`).toBeGreaterThan(
    before.clientWidth
  )
  await board.evaluate((el) => {
    el.scrollLeft = 200
  })
  expect(await board.evaluate((el) => el.scrollLeft), `${label}: scrollLeft`).toBeGreaterThan(0)
  await board.evaluate((el) => {
    el.scrollLeft = 0
  })
  expect(await pageOverflowX(page), `${label}: page overflow`).toBeLessThanOrEqual(1)
}

const main = (page: Page) => page.getByRole("main")
const filters = (page: Page) => main(page).getByRole("group", { name: "Issue filters" })
const statusSwitcher = (page: Page) => main(page).getByRole("group", { name: "Board status" })

test.describe("responsive Agent Workplace (phone)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("opens from the URL, switches status, opens a ticket, and does not scroll sideways", async ({
    page,
  }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
    await expect(statusSwitcher(page)).toBeVisible()
    await expect(main(page).getByRole("region", { name: "To Do" })).toBeVisible()
    await expect(main(page).getByRole("region", { name: "In Progress" })).toBeHidden()

    await expectTapTarget(page.getByRole("tab", { name: "Issues" }), "Issues tab")
    await expectTapTarget(filters(page).getByRole("button", { name: "All" }), "All filter")
    await expectTapTarget(page.getByRole("button", { name: "New issue" }), "New issue")
    await expectTapTarget(statusSwitcher(page).getByRole("button", { name: /To Do/ }), "To Do")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    await statusSwitcher(page).getByRole("button", { name: /In Progress/ }).click()
    await expect(main(page).getByRole("region", { name: "In Progress" })).toBeVisible()
    await expect(main(page).getByRole("region", { name: "To Do" })).toBeHidden()
    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-404/)
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("B1: every card is as wide as the board across all five statuses", async ({ page }) => {
    await page.goto("/agent-workplace")
    const board = page.getByTestId("workplace-board")
    await expect(board).toBeVisible()
    for (const status of STATUSES) {
      await statusSwitcher(page).getByRole("button", { name: new RegExp(status) }).click()
      const region = main(page).getByRole("region", { name: status })
      await expect(region).toBeVisible()
      const regionBox = await region.boundingBox()
      expect(regionBox, `${status} column painted`).toBeTruthy()
      const cards = region.getByRole("button")
      const count = await cards.count()
      expect(count, `${status} has cards`).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        const box = await cards.nth(i).boundingBox()
        expect(box, `${status} card ${i} painted`).toBeTruthy()
        expect(
          Math.abs(box!.width - regionBox!.width),
          `${status} card ${i} equals board width`
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  test("B2: In Progress → ticket → Back stays on In Progress", async ({ page }) => {
    await page.goto("/agent-workplace")
    await statusSwitcher(page).getByRole("button", { name: /In Progress/ }).click()
    await expect(statusSwitcher(page).getByRole("button", { name: /In Progress/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    await page.getByRole("button", { name: "Back to the board" }).click()
    await expect(statusSwitcher(page).getByRole("button", { name: /In Progress/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(main(page).getByRole("region", { name: "In Progress" })).toBeVisible()
    await expect(main(page).getByRole("region", { name: "To Do" })).toBeHidden()
  })

  test("B8: a phone status change from the ticket survives reload", async ({ page }) => {
    await page.goto("/agent-workplace")
    await page.getByRole("button", { name: /Copy-link expires after 7 days/ }).click()
    const rail = page.getByRole("complementary", { name: "Ticket properties" })
    await rail.getByRole("button", { name: "To Do" }).click()
    await page.getByRole("button", { name: "Blocked", exact: true }).click()
    await expect(rail.getByRole("button", { name: "Blocked" })).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole("heading", { level: 1, name: "Copy-link expires after 7 days" })
    ).toBeVisible()
    await expect(
      page.getByRole("complementary", { name: "Ticket properties" }).getByRole("button", {
        name: "Blocked",
      })
    ).toBeVisible()
  })

  test("Schedule and Next-run cells stay hidden and the ok pill sits on the name row", async ({
    page,
  }) => {
    await page.goto("/agent-workplace?tab=autopilots")
    const row = page.getByRole("row").filter({ hasText: "Daily standup summary" })
    await expect(row).toBeVisible()
    const schedule = row.getByRole("cell").nth(1)
    const next = row.getByRole("cell").nth(2)
    expect(await schedule.evaluate((el) => getComputedStyle(el).display), "Schedule display").toBe(
      "none"
    )
    expect(await next.evaluate((el) => getComputedStyle(el).display), "Next run display").toBe("none")
    const name = row.getByRole("cell").nth(0).locator("p").first()
    const pill = row.getByText("ok", { exact: true })
    const nameBox = await name.boundingBox()
    const pillBox = await pill.boundingBox()
    expect(nameBox, "name painted").toBeTruthy()
    expect(pillBox, "ok pill painted").toBeTruthy()
    expect(pillBox!.y, "ok pill top sits in the name row").toBeGreaterThanOrEqual(nameBox!.y - 2)
    expect(pillBox!.y, "ok pill top sits in the name row").toBeLessThan(nameBox!.y + nameBox!.height)
  })

  test("B7: Bugs Reset stays compact; Workplace Reset is 44px", async ({ page }) => {
    await page.goto("/bugs")
    const bugsReset = page.getByRole("button", { name: "Reset" })
    await expect(bugsReset).toBeVisible()
    const bugsBox = await bugsReset.boundingBox()
    expect(bugsBox, "Bugs Reset painted").toBeTruthy()
    expect(bugsBox!.height, "Bugs Reset is not a 44px target").toBeLessThan(44)

    await page.goto("/agent-workplace")
    await expectTapTarget(page.getByRole("button", { name: "Reset" }), "Workplace Reset")
  })
})

test.describe("responsive Agent Workplace (tablet-portrait)", () => {
  test.use({ viewport: VIEWPORTS["tablet-portrait"] })

  test("opens from the URL, keeps the board, opens a ticket, and does not scroll the page sideways", async ({
    page,
  }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
    await expect(statusSwitcher(page)).toBeHidden()
    for (const col of STATUSES) {
      await expect(main(page).getByRole("region", { name: col })).toBeAttached()
    }
    await expectTapTarget(page.getByRole("tab", { name: "Issues" }), "Issues tab")
    await expectTapTarget(filters(page).getByRole("button", { name: "All" }), "All filter")
    await expectTapTarget(page.getByRole("button", { name: "New issue" }), "New issue")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    await page.getByRole("button", { name: /Undo stack for iPad canvas/ }).click()
    await expect(page).toHaveURL(/issue=CHLK-404/)
    await expect(page.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("B8: the board scroller moves while the page does not", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expectBoardScrollsInternally(page, "820")
  })

  test("B8: Tab reaches an off-screen Blocked card", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("button", { name: /Refund path for annual seats/ })).toBeAttached()
    await filters(page).getByRole("button", { name: "All" }).focus()
    let reached = false
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab")
      const text = await page.evaluate(() => document.activeElement?.textContent ?? "")
      if (text.includes("Refund path for annual seats")) {
        reached = true
        break
      }
    }
    expect(reached, "Tab landed on a Blocked card").toBe(true)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("B5: Schedule and Next run fold into the first Autopilot cell", async ({ page }) => {
    await page.goto("/agent-workplace?tab=autopilots")
    await expect(page.getByRole("tab", { name: "Autopilots" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(page.getByRole("columnheader", { name: "Autopilot" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Last run" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Schedule" })).toBeHidden()
    await expect(page.getByRole("columnheader", { name: "Next run" })).toBeHidden()
    const folded = page.locator("p").filter({ hasText: /^Next run / })
    await expect(folded).toHaveCount(3)
    await expect(folded.first()).toBeVisible()
    const row = page.getByRole("row").filter({ hasText: "Daily standup summary" })
    expect(
      await row.getByRole("cell").nth(1).evaluate((el) => getComputedStyle(el).display),
      "Schedule display at 820"
    ).toBe("none")
    expect(
      await row.getByRole("cell").nth(2).evaluate((el) => getComputedStyle(el).display),
      "Next run display at 820"
    ).toBe("none")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive Agent Workplace (tablet-landscape 1180)", () => {
  test.use({ viewport: VIEWPORTS["tablet-landscape"] })

  test("B8: board scrolls internally, page does not, switcher stays hidden", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
    await expect(statusSwitcher(page)).toBeHidden()
    for (const col of STATUSES) {
      await expect(main(page).getByRole("region", { name: col })).toBeAttached()
    }
    await expectTapTarget(page.getByRole("tab", { name: "Issues" }), "Issues tab")
    await expectTapTarget(filters(page).getByRole("button", { name: "All" }), "All filter")
    await expectTapTarget(page.getByRole("button", { name: "New issue" }), "New issue")
    await expectBoardScrollsInternally(page, "1180")
  })
})

test.describe("responsive Agent Workplace (phone 360 sanity)", () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test("does not scroll the page sideways", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

test.describe("responsive Agent Workplace (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("keeps five columns and does not show the status switcher", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expect(statusSwitcher(page)).toBeHidden()
    for (const col of STATUSES) {
      await expect(main(page).getByRole("region", { name: col })).toBeVisible()
    }
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("B4: header is at least develop's 40px", async ({ page }) => {
    await page.goto("/agent-workplace")
    const header = main(page).locator("header").first()
    const box = await header.boundingBox()
    expect(box, "header painted").toBeTruthy()
    expect(box!.height, "md:min-h-10").toBeGreaterThanOrEqual(40)
  })

  test("B5: Autopilots show Schedule and Next run as columns", async ({ page }) => {
    await page.goto("/agent-workplace?tab=autopilots")
    await expect(page.getByRole("columnheader", { name: "Schedule" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Next run" })).toBeVisible()
  })
})

for (const theme of ["light", "dark"] as const) {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`readable Agent Workplace (${name} ${theme})`, () => {
      test.use({ viewport })

      test(`B8: text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await forceTheme(page, theme)
        await page.goto("/agent-workplace")
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
        )
        const label = `${theme}/${name}`
        await expectReadable(
          page.getByRole("heading", { level: 1, name: "Agent Workplace" }),
          `${label}/title`,
          expect
        )
        await expectReadable(page.getByTestId("persistence-note"), `${label}/note`, expect)
        await expectReadable(page.getByRole("tab", { name: "Issues" }), `${label}/tab`, expect)
        await expectReadable(filters(page).getByRole("button", { name: "All" }), `${label}/filter`, expect)
      })
    })
  }
}
