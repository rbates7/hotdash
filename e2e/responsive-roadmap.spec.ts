import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable, settleAnimations } from "./support/contrast"
import { NOTE, NOTE_NAME } from "./support/persistence"
import {
  expectFocusTrapped,
  expectNoOverflowX,
  expectScrollLock,
  pageOverflowX,
  sheetOverlay,
  waitForHydration,
} from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Product Roadmap at phone / tablet / desktop (Deke 13:2202, 13:2423, 13:2650,
 * 13:2968). Phone and 820: Now/Next/Later segments + cards of the selected
 * column (1-col / 2-col). 1180 and desktop keep three columns. The existing
 * edit dialog docks as a bottom sheet below `md`.
 */

const STORAGE_KEY = "hotdash.product-roadmap.v1"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const board = (page: Page) => page.getByRole("region", { name: "Roadmap sequence", exact: true })
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) =>
  board(page).getByRole("article", { name: title, exact: true })
const actions = (page: Page) => page.getByRole("group", { name: "Page actions", exact: true })
const chips = (page: Page) => page.getByRole("group", { name: "Filter by column", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const persistence = (page: Page) =>
  page.getByRole("status", { name: NOTE_NAME, exact: true })

async function fresh(page: Page) {
  await page.goto("/product-roadmap")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistence(page)).toHaveText(NOTE.unsaved)
}

async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

const INTERACTIVE =
  "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='checkbox'], [role='switch'], [role='tab'], [tabindex]:not([tabindex='-1'])"

async function expectAllTargets44(scope: Locator, label: string) {
  await settleAnimations(scope.page())
  const measured = await scope.locator(INTERACTIVE).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const name =
        el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48)
      return {
        name: `${el.tagName.toLowerCase()} "${name}"`,
        width: r.width,
        height: r.height,
        painted: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
      }
    })
  )
  const painted = measured.filter((m) => m.painted)
  expect(painted.length, `${label}: controls measured`).toBeGreaterThan(0)
  const small = painted
    .filter((m) => m.width < 44 || m.height < 44)
    .map((m) => `${m.name} ${m.width.toFixed(1)}×${m.height.toFixed(1)}`)
  expect(small, `${label}: every control ≥ 44×44`).toEqual([])
}

async function expectSheetDocked(page: Page, sheet: Locator) {
  await settleAnimations(page)
  const box = await sheet.boundingBox()
  const viewport = page.viewportSize()
  expect(box, "sheet painted").toBeTruthy()
  expect(viewport, "viewport").toBeTruthy()
  expect(box!.y + box!.height, "sheet sits on the bottom edge").toBeGreaterThan(viewport!.height * 0.85)
  expect(box!.x, "sheet is full width").toBeLessThanOrEqual(1)
  expect(box!.width, "sheet spans the viewport").toBeGreaterThan(viewport!.width - 2)
}

/**
 * WCAG contrast between painted backgrounds (pressed vs unpressed). Copied
 * locally so e2e/support stays untouched.
 */
async function backgroundContrast(a: Locator, b: Locator) {
  return a.evaluate((elA, elB) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, bb, alpha] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b: bb, a: alpha / 255 }
    }
    const over = (
      top: { r: number; g: number; b: number; a: number },
      under: { r: number; g: number; b: number }
    ) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const painted = (el: Element) => {
      const layers: ReturnType<typeof parse>[] = []
      let node: Element | null = el
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg.a > 0) layers.push(bg)
        if (bg.a >= 1) break
        node = node.parentElement
      }
      let backdrop = { r: 255, g: 255, b: 255 }
      for (const layer of layers.reverse()) backdrop = over(layer, backdrop)
      return backdrop
    }
    const [l1, l2] = [lum(painted(elA)), lum(painted(elB as Element))].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }, await b.elementHandle())
}

async function expectPressedContrast(group: Locator, label: string) {
  const pressed = group.getByRole("button", { pressed: true })
  const unpressed = group.getByRole("button", { pressed: false }).first()
  await expect(pressed).toBeVisible()
  const ratio = await backgroundContrast(pressed, unpressed)
  expect(ratio, `${label} pressed vs unpressed ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
  await expectReadable(pressed, `${label} pressed`, expect)
  await expectReadable(unpressed, `${label} unpressed`, expect)
}

async function expectUnclipped(locator: Locator, label: string) {
  const box = await locator.evaluate((el) => ({
    scroll: (el as HTMLElement).scrollHeight,
    client: (el as HTMLElement).clientHeight,
  }))
  expect(box.scroll, `${label}: content not clipped`).toBeLessThanOrEqual(box.client + 1)
}

/* ------------------------------------------------------------------ phone */

test.describe("responsive Product Roadmap (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("segments filter the board, hide the other columns, and do not scroll sideways", async ({
    page,
  }) => {
    await fresh(page)
    await expect(main(page).getByRole("heading", { level: 1, name: "Product Roadmap" })).toBeVisible()
    await expect(chips(page)).toBeVisible()
    await expect(chips(page).getByRole("button")).toHaveCount(3)
    await expect(chips(page).getByRole("button", { name: /Now/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(column(page, "Now").getByRole("listitem")).toHaveCount(3)
    await expect(column(page, "Next")).toHaveCount(0)
    await expect(column(page, "Later")).toHaveCount(0)

    await expect(card(page, "Flag Football 2026")).toContainText("biggest wave of new coaches")
    await expect(card(page, "Flag Football 2026").getByTestId("sample-data-tag")).toBeVisible()
    await expect(card(page, "Flag Football 2026").getByRole("button", { name: "Edit" })).toBeVisible()
    await expect(card(page, "Flag Football 2026").getByRole("button", { name: "Move down" })).toBeVisible()

    const add = header(page).getByRole("button", { name: "New bet", exact: true })
    await expectTapTarget(add, "New bet")
    await expect(actions(page).getByRole("button", { name: "New bet", exact: true })).toBeHidden()

    for (const name of ["Now", "Next", "Later"]) {
      const seg = chips(page).getByRole("button", { name: new RegExp(name) })
      await expectTapTarget(seg, `segment ${name}`)
      const box = await seg.boundingBox()
      const viewport = page.viewportSize()
      expect(box, `${name} painted`).toBeTruthy()
      expect(viewport, "viewport").toBeTruthy()
      expect(box!.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${name} ends on screen`).toBeLessThanOrEqual(viewport!.width + 1)
    }

    await chips(page).getByRole("button", { name: /Next/ }).click()
    await expect(column(page, "Next").getByRole("listitem")).toHaveCount(3)
    await expect(card(page, "Web import from a link")).toContainText("From Feature Request")
    await expect(column(page, "Now")).toHaveCount(0)

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    await expectNoOverflowX(page)
    await expectAllTargets44(main(page), "390 main")

    await add.click()
    const created = dialog(page, "New bet")
    await expect(created).toBeVisible()
    await expectAllTargets44(created, "390 new-bet")
    await expectUnclipped(created.getByLabel("Why it matters"), "390 new-bet why")
    await created.getByLabel("Why it matters").fill("x".repeat(280))
    await expectUnclipped(created.getByLabel("Why it matters"), "390 new-bet 280 why")
    await created.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(created).toBeHidden()
  })

  test("a card opens the edit dialog as a bottom sheet; actions stay 44+", async ({ page }) => {
    await fresh(page)
    await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
    const sheet = dialog(page, "Bet: Flag Football 2026")
    await expect(sheet).toBeVisible()
    await expectSheetDocked(page, sheet)
    await expect(sheet.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
    await expect(sheet.getByRole("group", { name: "Column" })).toBeVisible()
    await expectAllTargets44(sheet, "390 sheet")
    await expectUnclipped(sheet.getByLabel("Why it matters"), "390 why")
    await expectNoOverflowX(page)

    await sheet.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(sheet.getByRole("button", { name: "Confirm delete", exact: true })).toBeVisible()
    await expectAllTargets44(sheet, "390 delete-confirm")
    await sheet.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(sheet.getByRole("button", { name: "Delete", exact: true })).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(card(page, "Flag Football 2026")).toBeFocused()
  })

  test("the sheet's × and a backdrop tap close it; focus returns to the card; focus is trapped", async ({
    page,
  }) => {
    await fresh(page)
    const who = "Flag Football 2026"
    await card(page, who).getByRole("button", { name: "Edit" }).click()
    const s = dialog(page, `Bet: ${who}`)
    await expect(s).toBeVisible()
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, s)

    const close = s.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "sheet ×")
    await close.click()
    await expect(s).toBeHidden()
    await expect(card(page, who)).toBeFocused()
    await expectScrollLock(page, false)

    await card(page, who).getByRole("button", { name: "Edit" }).click()
    await expect(s).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(s).toBeHidden()
    await expect(card(page, who)).toBeFocused()
    await expectScrollLock(page, false)
  })

  test("Delete and Move return focus to the next card", async ({ page }) => {
    await fresh(page)
    await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
    const first = dialog(page, "Bet: Flag Football 2026")
    await first.getByRole("button", { name: "Delete", exact: true }).click()
    await first.getByRole("button", { name: "Confirm delete", exact: true }).click()
    await expect(first).toBeHidden()
    await expect(card(page, "Play share links")).toBeFocused()

    await card(page, "Play share links").getByRole("button", { name: "Edit" }).click()
    const moved = dialog(page, "Bet: Play share links")
    await moved.getByRole("group", { name: "Column" }).getByRole("button", { name: "Next" }).click()
    await expect(moved).toBeHidden()
    await expect(card(page, "iPad forced updates")).toBeFocused()
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive Product Roadmap (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("layout, 44×44 New bet, and an unclipped why field", async ({ page }) => {
      await fresh(page)
      const portrait = name === "tablet-portrait"

      if (portrait) {
        await expect(chips(page)).toBeVisible()
        await expect(column(page, "Now").getByRole("article")).toHaveCount(3)
        await expect(column(page, "Next")).toHaveCount(0)
        const first = await card(page, "Flag Football 2026").boundingBox()
        const second = await card(page, "Play share links").boundingBox()
        expect(first && second, "first two Now cards painted").toBeTruthy()
        expect(Math.abs(first!.y - second!.y), "820 is a 2-column card grid").toBeLessThan(4)
        expect(second!.x, "second card sits beside the first").toBeGreaterThan(
          first!.x + first!.width - 2
        )
      } else {
        await expect(chips(page)).toHaveCount(0)
        await expect(column(page, "Now").getByRole("article")).toHaveCount(3)
        await expect(column(page, "Next").getByRole("article")).toHaveCount(3)
        await expect(column(page, "Later").getByRole("article")).toHaveCount(2)
        const now = await column(page, "Now").boundingBox()
        const next = await column(page, "Next").boundingBox()
        const later = await column(page, "Later").boundingBox()
        expect(now && next && later, "three columns painted").toBeTruthy()
        expect(Math.abs(now!.y - later!.y), "1180 is one row").toBeLessThan(4)
        expect(next!.x, "Next sits beside Now").toBeGreaterThan(now!.x + now!.width - 2)
      }

      await expectTapTarget(
        actions(page).getByRole("button", { name: "New bet", exact: true }),
        "New bet"
      )
      await expect(header(page).getByRole("button", { name: "New bet", exact: true })).toHaveCount(1)

      await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
      const d = dialog(page, "Bet: Flag Football 2026")
      await expect(d).toBeVisible()
      await expect(d.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
      await expectAllTargets44(d, `${VIEWPORTS[name].width} dialog`)
      await expectUnclipped(d.getByLabel("Why it matters"), `${VIEWPORTS[name].width} why`)
      await d.getByLabel("Why it matters").fill("x".repeat(280))
      await expectUnclipped(d.getByLabel("Why it matters"), `${VIEWPORTS[name].width} 280 why`)
      await d.getByRole("button", { name: "Delete", exact: true }).click()
      await expect(d.getByRole("button", { name: "Confirm delete", exact: true })).toBeVisible()
      await expectAllTargets44(d, `${VIEWPORTS[name].width} delete-confirm`)
      await d.getByRole("button", { name: "Keep it", exact: true }).click()
      await page.keyboard.press("Escape")
      await expect(d).toBeHidden()

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      await expectNoOverflowX(page)
      await expectAllTargets44(main(page), `${VIEWPORTS[name].width} main`)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Product Roadmap (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: three columns, New bet in Page actions, no switcher", async ({ page }) => {
    await fresh(page)
    await expect(chips(page)).toHaveCount(0)
    await expect(column(page, "Now").getByRole("article")).toHaveCount(3)
    await expect(column(page, "Next").getByRole("article")).toHaveCount(3)
    await expect(column(page, "Later").getByRole("article")).toHaveCount(2)
    await expect(actions(page).getByRole("button", { name: "New bet", exact: true })).toBeVisible()
    await expect(board(page).getByRole("list")).toHaveCount(0)

    const boxes = []
    for (const name of ["Now", "Next", "Later"]) {
      boxes.push(await column(page, name).boundingBox())
    }
    expect(boxes.every(Boolean), "three columns painted").toBeTruthy()
    expect(Math.abs(boxes[0]!.y - boxes[2]!.y), "one row").toBeLessThan(4)
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x)
    expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x)

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

    await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
    const d = dialog(page, "Bet: Flag Football 2026")
    await expect(d).toBeVisible()
    const why = d.getByLabel("Why it matters")
    const whyBox = await why.boundingBox()
    expect(whyBox, "desktop why painted").toBeTruthy()
    expect(whyBox!.height, "Edit why stays develop rows (~60px)").toBeLessThan(90)
    expect(whyBox!.height).toBeGreaterThan(40)
    await expect(d.getByRole("group", { name: "Column" })).toHaveCount(0)
    await d.getByRole("button", { name: "Delete", exact: true }).click()
    const confirm = d.getByRole("button", { name: "Confirm delete", exact: true })
    await expect(confirm).toBeVisible()
    await expect(confirm).toHaveClass(/cn-button-variant-destructive/)
    await page.keyboard.press("Escape")

    const add = actions(page).getByRole("button", { name: "New bet", exact: true })
    await add.click()
    const created = dialog(page, "New bet")
    await expect(created).toBeVisible()
    const newWhy = await created.getByLabel("Why it matters").boundingBox()
    expect(newWhy, "New bet why painted").toBeTruthy()
    expect(newWhy!.height, "New bet why is develop rows (~60px)").toBeGreaterThanOrEqual(48)
    expect(newWhy!.height, "New bet why is develop rows (~60px)").toBeLessThanOrEqual(88)
  })
})

/* --------------------------------------------------------------- readable */

const READABLE = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of READABLE) {
    test.describe(`readable Product Roadmap (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const label = `${theme}/${size}`
        await expectReadable(
          header(page).getByRole("heading", { level: 1, name: "Product Roadmap" }),
          `${label}/title`,
          expect
        )
        await expectReadable(header(page).locator("p").first(), `${label}/subtitle`, expect)
        await expectReadable(persistence(page), `${label}/note`, expect)
        await expectReadable(header(page).getByTestId("sample-data-badge"), `${label}/header badge`, expect)
        await expectReadable(board(page), `${label}/board`, expect)
        const newBet = (size === "390" ? header(page) : actions(page)).getByRole("button", {
          name: "New bet",
          exact: true,
        })
        await expectReadable(newBet, `${label}/new bet`, expect)
        if (size === "390" || size === "820") {
          await expectReadable(chips(page), `${label}/segments`, expect)
          await expectPressedContrast(chips(page), `${label}/segments`)
        }
        await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
        const sheet = dialog(page, "Bet: Flag Football 2026")
        await expect(sheet).toBeVisible()
        await expectReadable(sheet.getByLabel("Why it matters"), `${label}/why`, expect)
        await expectPressedContrast(sheet.getByRole("group", { name: "Owner" }), `${label}/owner`)
        await expectPressedContrast(sheet.getByRole("group", { name: "Column" }), `${label}/column`)
        await expectReadable(
          sheet.getByRole("button", { name: "Cancel", exact: true }),
          `${label}/cancel`,
          expect
        )
        await expectReadable(
          sheet.getByRole("button", { name: "Delete", exact: true }),
          `${label}/delete`,
          expect
        )
        await sheet.getByRole("button", { name: "Delete", exact: true }).click()
        await expectReadable(
          sheet.getByRole("button", { name: "Confirm delete", exact: true }),
          `${label}/confirm delete`,
          expect
        )
        await expectReadable(
          sheet.getByRole("button", { name: "Keep it", exact: true }),
          `${label}/keep it`,
          expect
        )
        await page.keyboard.press("Escape")
        await expect(sheet).toBeHidden()
        await newBet.click()
        const created = dialog(page, "New bet")
        await expect(created).toBeVisible()
        await expectReadable(
          created.getByRole("button", { name: "Cancel", exact: true }),
          `${label}/new-bet cancel`,
          expect
        )
      })
    })
  }
}
