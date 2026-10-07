import { expect, test, type Page } from "@playwright/test"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

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

for (const vp of VIEWPORTS) {
  test.describe(`responsive Home (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("opens from the URL, runs the happy path, and does not scroll sideways", async ({
      page,
    }) => {
      await page.goto("/home")
      await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
      await expect(page.getByText(/pulse$/)).toBeVisible()
      await expect(
        page.getByRole("heading", { level: 2, name: "Call Aledo before Friday" })
      ).toBeVisible()
      await expect(page.getByRole("article", { name: "Subscribers" })).toBeVisible()
      await expect(page.getByRole("article", { name: "Cash this week" })).toBeVisible()
      await expect(page.getByText("186")).toBeVisible()
      await expect(page.getByText("3 agents working")).toBeVisible()
      await expect(page.getByText("2 waiting")).toBeVisible()

      await expectTapTarget(page.getByRole("button", { name: "Reset" }), "Reset")
      await expectTapTarget(page.getByRole("link", { name: "My Desk" }), "My Desk")
      await expectTapTarget(
        page.getByRole("link", { name: "Open Agent Workplace" }),
        "Open Agent Workplace"
      )
      await expectTapTarget(page.getByRole("link", { name: /Agent blocked/ }), "Needs-you row")

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      await page.getByRole("link", { name: /Agent blocked/ }).click()
      await expect(page).toHaveURL(/\/agent-workplace\?tab=inbox&issue=CHLK-412$/)
      await expect(
        page.getByRole("heading", { level: 1, name: "Refund path for annual seats" })
      ).toBeVisible()
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

test.describe("responsive Home (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the three-door row and does not scroll sideways", async ({ page }) => {
    await page.goto("/home")
    const doors = page.getByRole("group", { name: "Doors" })
    await expect(doors.getByRole("region", { name: "Metrics" })).toBeVisible()
    await expect(doors.getByRole("region", { name: "Agent Workplace" })).toBeVisible()
    await expect(doors.getByRole("region", { name: "Inbox" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})
