import { expect, test, type Page } from "@playwright/test"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

async function pageOverflowX(page: Page) {
  return page.evaluate(() => {
    const prev = window.scrollX
    window.scrollTo(1_000_000, window.scrollY)
    const scrolled = window.scrollX
    window.scrollTo(prev, window.scrollY)
    return scrolled
  })
}

async function expectTapTarget(locator: ReturnType<Page["getByRole"]>, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

const main = (page: Page) => page.getByRole("main")
const filters = (page: Page) => main(page).getByRole("group", { name: "Issue filters" })
const statusSwitcher = (page: Page) => main(page).getByRole("group", { name: "Board status" })

test.describe("responsive Agent Workplace (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

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
})

test.describe("responsive Agent Workplace (tablet-portrait)", () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test("opens from the URL, keeps the board, opens a ticket, and does not scroll the page sideways", async ({
    page,
  }) => {
    await page.goto("/agent-workplace")
    await expect(page.getByRole("heading", { level: 1, name: "Agent Workplace" })).toBeVisible()
    await expect(statusSwitcher(page)).toBeHidden()
    for (const col of ["To Do", "In Progress", "In Review", "Done", "Blocked"]) {
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
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps five columns and does not show the status switcher", async ({ page }) => {
    await page.goto("/agent-workplace")
    await expect(statusSwitcher(page)).toBeHidden()
    for (const col of ["To Do", "In Progress", "In Review", "Done", "Blocked"]) {
      await expect(main(page).getByRole("region", { name: col })).toBeVisible()
    }
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})
