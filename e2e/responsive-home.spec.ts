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

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
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
      await expectTapTarget(
        page.getByRole("region", { name: "Number one" }).getByRole("link", { name: "My Desk" }),
        "My Desk"
      )
      await expectTapTarget(
        page.getByRole("link", { name: "Open Agent Workplace" }),
        "Open Agent Workplace"
      )
      await expectTapTarget(page.getByRole("link", { name: /Agent blocked/ }), "Needs-you row")

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      const title = page.getByRole("heading", { level: 1, name: "Home" })
      const note = page.getByTestId("persistence-note")
      const dummy = page.getByText("Dummy / design mock", { exact: true })
      await expect(dummy).toBeVisible()
      const titleBox = await title.boundingBox()
      const noteBox = await note.boundingBox()
      const dummyBox = await dummy.boundingBox()
      expect(titleBox, "Home title painted").toBeTruthy()
      expect(noteBox, "persistence note painted").toBeTruthy()
      expect(dummyBox, "dummy stamp painted").toBeTruthy()
      expect(boxesOverlap(titleBox!, noteBox!), "note overlaps Home title").toBe(false)
      expect(boxesOverlap(titleBox!, dummyBox!), "dummy stamp overlaps Home title").toBe(false)
      expect(noteBox!.y, "note sits under the title").toBeGreaterThan(titleBox!.y + titleBox!.height - 1)
      expect(dummyBox!.width, "dummy stamp is not ellipsized").toBeGreaterThan(100)

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

const TILE_WIDTHS = [
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
  { name: "1440", width: 1440, height: 900 },
] as const

for (const vp of TILE_WIDTHS) {
  test.describe(`responsive Home (dev-board tiles ${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("no two status tile labels overlap", async ({ page }) => {
      await page.goto("/home")
      const tiles = page.getByRole("list", { name: "Columns" }).getByRole("listitem")
      await expect(tiles).toHaveCount(5)
      const boxes = []
      for (let i = 0; i < 5; i++) {
        const tile = tiles.nth(i)
        const label = tile.getByTestId("dev-board-tile-label")
        const box = await label.boundingBox()
        const tileBox = await tile.boundingBox()
        expect(box, `tile label ${i} painted`).toBeTruthy()
        expect(tileBox, `tile ${i} painted`).toBeTruthy()
        expect(box!.width, `tile label ${i} has width`).toBeGreaterThan(0)
        expect(box!.height, `tile label ${i} has height`).toBeGreaterThan(0)
        expect(box!.x, `label ${i} stays in tile`).toBeGreaterThanOrEqual(tileBox!.x - 0.5)
        expect(box!.x + box!.width, `label ${i} does not overflow tile`).toBeLessThanOrEqual(
          tileBox!.x + tileBox!.width + 0.5
        )
        boxes.push(box!)
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(
            boxesOverlap(boxes[i], boxes[j]),
            `labels ${i} and ${j} intersect at ${vp.name}`
          ).toBe(false)
        }
      }
    })
  })
}
