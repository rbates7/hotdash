import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable, settleAnimations } from "./support/contrast"
import { NOTE, NOTE_NAME } from "./support/persistence"
import { expectNoOverflowX, pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Feature Request at phone / tablet / desktop (Deke 13:1651, 13:1766, 13:2075).
 * Phone: status chips + one column of cards; the existing idea dialog docks
 * as a bottom sheet. Tablet 820 is 2×2. 1180 and desktop keep four columns.
 */

const STORAGE_KEY = "hotdash.feature-requests.v1"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const board = (page: Page) =>
  page.getByRole("region", { name: "Feature request intake", exact: true })
const column = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) =>
  board(page).getByRole("button", { name: `Open idea: ${title}`, exact: true })
const actions = (page: Page) => page.getByRole("group", { name: "Page actions", exact: true })
const chips = (page: Page) => page.getByRole("tablist", { name: "Status", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const persistence = (page: Page) =>
  page.getByRole("status", { name: NOTE_NAME, exact: true })

async function fresh(page: Page) {
  await page.goto("/feature-request")
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

/* ------------------------------------------------------------------ phone */

test.describe("responsive Feature Request (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("chips filter the board, hides the other columns, and does not scroll sideways", async ({
    page,
  }) => {
    await fresh(page)
    await expect(main(page).getByRole("heading", { level: 1, name: "Feature Request" })).toBeVisible()
    await expect(chips(page)).toBeVisible()
    await expect(chips(page).getByRole("tab")).toHaveCount(4)
    await expect(chips(page).getByRole("tab", { name: /Inbox/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(column(page, "Inbox").getByRole("listitem")).toHaveCount(3)
    await expect(column(page, "Triaged")).toHaveCount(0)
    await expect(column(page, "On Roadmap")).toHaveCount(0)
    await expect(column(page, "Parked")).toHaveCount(0)

    await expect(card(page, "Play of the Day")).toContainText("Pin one ready-to-run play")
    await expect(card(page, "Play of the Day").getByTestId("sample-data-tag")).toBeVisible()

    // New idea sits beside the title; the actions-group copy is hidden.
    const add = header(page).getByRole("button", { name: "New idea", exact: true })
    await expectTapTarget(add, "New idea")
    await expect(actions(page).getByRole("button", { name: "New idea", exact: true })).toBeHidden()

    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      await expectTapTarget(chips(page).getByRole("tab", { name: new RegExp(name) }), `chip ${name}`)
    }

    await chips(page).getByRole("tab", { name: /On Roadmap/ }).click()
    await expect(column(page, "On Roadmap").getByRole("listitem")).toHaveCount(2)
    await expect(card(page, "Play share links")).toContainText("Roadmap")
    await expect(column(page, "Inbox")).toHaveCount(0)

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    await expectNoOverflowX(page)
    await expectAllTargets44(main(page), "390 main")
  })

  test("a card opens the idea dialog as a bottom sheet; actions stay 44+ and the handoff works", async ({
    page,
  }) => {
    await fresh(page)
    await card(page, "Play of the Day").click()
    const sheet = dialog(page, "Idea: Play of the Day")
    await expect(sheet).toBeVisible()
    await expectSheetDocked(page, sheet)
    await expect(sheet.getByRole("button", { name: "Move to On Roadmap", exact: true })).toBeVisible()
    await expectAllTargets44(sheet, "390 sheet")
    await expectNoOverflowX(page)

    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(card(page, "Play of the Day")).toBeFocused()

    await card(page, "Custom play headers").click()
    const moved = dialog(page, "Idea: Custom play headers")
    await expect(moved).toBeVisible()
    await moved.getByRole("button", { name: "Move to On Roadmap", exact: true }).click()
    await expect(moved).toBeHidden()
    await chips(page).getByRole("tab", { name: /On Roadmap/ }).click()
    await expect(card(page, "Custom play headers")).toBeVisible()
    await card(page, "Custom play headers").click()
    await expect(dialog(page, "Idea: Custom play headers")).toContainText("On Roadmap here only.")
  })

  test("the sheet traps focus", async ({ page }) => {
    await fresh(page)
    await card(page, "Play of the Day").click()
    const sheet = dialog(page, "Idea: Play of the Day")
    await expect(sheet).toBeVisible()
    await settleAnimations(page)
    // Base UI parks a focus guard next to the popup; poll so the trap has
    // time to bounce Tab back inside `[role=dialog]`.
    const focusInside = () => sheet.evaluate((el) => el.contains(document.activeElement))
    await expect.poll(focusInside, { message: "focus starts in the sheet" }).toBe(true)
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press("Tab")
      await expect.poll(focusInside, { message: `Tab ${i + 1}` }).toBe(true)
    }
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive Feature Request (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("shows all four columns, no chips, and a 44×44 New idea", async ({ page }) => {
      await fresh(page)
      await expect(chips(page)).toHaveCount(0)
      await expect(column(page, "Inbox").getByRole("button", { name: /^Open idea:/ })).toHaveCount(3)
      await expect(column(page, "Triaged").getByRole("button", { name: /^Open idea:/ })).toHaveCount(3)
      await expect(column(page, "On Roadmap").getByRole("button", { name: /^Open idea:/ })).toHaveCount(2)
      await expect(column(page, "Parked").getByRole("button", { name: /^Open idea:/ })).toHaveCount(2)
      await expect(board(page).getByRole("list")).toHaveCount(0)

      const inbox = column(page, "Inbox")
      const triaged = column(page, "Triaged")
      const inboxBox = await inbox.boundingBox()
      const triagedBox = await triaged.boundingBox()
      expect(inboxBox && triagedBox, "Inbox and Triaged painted").toBeTruthy()
      if (name === "tablet-portrait") {
        expect(Math.abs(inboxBox!.y - triagedBox!.y), "820 is 2×2").toBeLessThan(4)
        expect(triagedBox!.x, "Triaged sits beside Inbox").toBeGreaterThan(
          inboxBox!.x + inboxBox!.width - 2
        )
      } else {
        expect(Math.abs(inboxBox!.y - triagedBox!.y), "1180 is one row").toBeLessThan(4)
        expect(triagedBox!.x, "Triaged sits beside Inbox").toBeGreaterThan(
          inboxBox!.x + inboxBox!.width - 2
        )
        const parked = await column(page, "Parked").boundingBox()
        expect(parked, "Parked painted").toBeTruthy()
        expect(Math.abs(inboxBox!.y - parked!.y), "Parked stays on the first row").toBeLessThan(4)
      }

      await expectTapTarget(
        actions(page).getByRole("button", { name: "New idea", exact: true }),
        "New idea"
      )
      await expect(header(page).getByRole("button", { name: "New idea", exact: true })).toHaveCount(1)

      await card(page, "Play of the Day").click()
      const d = dialog(page, "Idea: Play of the Day")
      await expect(d).toBeVisible()
      await expect(d.getByRole("button", { name: "Move to On Roadmap", exact: true })).toBeVisible()
      await expectAllTargets44(d, `${VIEWPORTS[name].width} dialog`)
      await page.keyboard.press("Escape")
      await expect(d).toBeHidden()

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      await expectNoOverflowX(page)
      await expectAllTargets44(main(page), `${VIEWPORTS[name].width} main`)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Feature Request (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: four columns, New idea in Page actions, no chips", async ({ page }) => {
    await fresh(page)
    await expect(chips(page)).toHaveCount(0)
    await expect(column(page, "Inbox").getByRole("button", { name: /^Open idea:/ })).toHaveCount(3)
    await expect(column(page, "Triaged").getByRole("button", { name: /^Open idea:/ })).toHaveCount(3)
    await expect(column(page, "On Roadmap").getByRole("button", { name: /^Open idea:/ })).toHaveCount(2)
    await expect(column(page, "Parked").getByRole("button", { name: /^Open idea:/ })).toHaveCount(2)
    await expect(actions(page).getByRole("button", { name: "New idea", exact: true })).toBeVisible()
    await expect(board(page).getByRole("list")).toHaveCount(0)

    const boxes = []
    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      boxes.push(await column(page, name).boundingBox())
    }
    expect(boxes.every(Boolean), "four columns painted").toBeTruthy()
    expect(Math.abs(boxes[0]!.y - boxes[3]!.y), "one row").toBeLessThan(4)
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x)
    expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x)
    expect(boxes[3]!.x).toBeGreaterThan(boxes[2]!.x)

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
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
    test.describe(`readable Feature Request (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const label = `${theme}/${size}`
        await expectReadable(
          header(page).getByRole("heading", { level: 1, name: "Feature Request" }),
          `${label}/title`,
          expect
        )
        await expectReadable(header(page).locator("p").first(), `${label}/subtitle`, expect)
        await expectReadable(persistence(page), `${label}/note`, expect)
        await expectReadable(header(page).getByTestId("sample-data-tag"), `${label}/header tag`, expect)
        await expectReadable(board(page), `${label}/board`, expect)
        if (size === "390") {
          await expectReadable(chips(page), `${label}/chips`, expect)
        }
        await card(page, "Play of the Day").click()
        const sheet = dialog(page, "Idea: Play of the Day")
        await expect(sheet).toBeVisible()
        // Save stays disabled until the form is dirty; Nova fades disabled
        // controls to 0.5 opacity, which expectReadable rejects. Probe the
        // status path and the Roadmap hand-off instead of the whole dialog.
        await expectReadable(
          sheet.getByRole("group", { name: "Status" }).getByRole("button", { pressed: true }),
          `${label}/status`,
          expect
        )
        await expectReadable(
          sheet.getByRole("button", { name: "Move to On Roadmap", exact: true }),
          `${label}/handoff`,
          expect
        )
        await expectReadable(
          sheet.getByText("Moves the card to the On Roadmap column", { exact: false }),
          `${label}/handoff note`,
          expect
        )
        await expectReadable(
          sheet.getByRole("button", { name: "Cancel", exact: true }),
          `${label}/cancel`,
          expect
        )
      })
    })
  }
}
