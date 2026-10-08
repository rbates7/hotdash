import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { expectNoOverflowX, pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Sales Opportunities at phone / tablet / desktop (Deke 9:339, 9:530, 9:939,
 * 7:47). Phone stacks RowCollapse cards with a bottom sheet; tablet keeps a
 * 5-column table with one ellipsis per row; desktop (≥1280) is unchanged.
 */

const STORAGE_KEY = "hotdash.sales-opportunities.v1"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const screen = (page: Page) => page.getByRole("region", { name: "Sales Opportunities", exact: true })
const deals = (page: Page) => screen(page).getByRole("region", { name: "Deals", exact: true })
const table = (page: Page) => deals(page).getByRole("table", { name: "Deals", exact: true })
const rows = (page: Page) => table(page).locator("tbody").getByRole("row")
const row = (page: Page, who: RegExp) => table(page).getByRole("row", { name: who })
const cardList = (page: Page) => deals(page).getByRole("list")
const cards = (page: Page) => cardList(page).locator("[data-slot='row-collapse']")
const card = (page: Page, who: string) =>
  cardList(page).getByRole("button", { name: new RegExp(`^${who}`) })
const sheet = (page: Page, who: string) => page.getByRole("dialog", { name: who, exact: true })
const sheetActions = (page: Page, who: string) =>
  sheet(page, who).getByRole("group", { name: "Deal actions", exact: true }).getByRole("button")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function fresh(page: Page) {
  await page.goto("/sales-opportunities")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
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

/**
 * Every painted control in `scope` is at least 44×44. Lists every offender
 * so one run shows them all; a single 43px target fails.
 */
async function expectAllTargets44(scope: Locator, label: string) {
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

/* ------------------------------------------------------------------ phone */

test.describe("responsive Sales (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("stacks RowCollapse cards, hides the table, and does not scroll sideways", async ({ page }) => {
    await fresh(page)
    await expect(cards(page)).toHaveCount(6)
    await expect(table(page)).toBeHidden()
    await expect(rows(page).first()).toBeHidden()

    const pruitt = card(page, "Coach Lonnie Pruitt")
    await expect(pruitt).toBeVisible()
    await expect(pruitt).toHaveAttribute("data-state", "attention")
    await expect(pruitt).toContainText("Cedar Creek HS (6A) · Staff seats × 5 · $1,500")
    await expect(pruitt).toContainText("Collect the PO from the booster club")
    await expect(pruitt).toContainText("Overdue 2 days")
    await expect(pruitt.getByTestId("sample-data-tag")).toBeVisible()
    await expect(card(page, "Coach Tommy Hale")).toContainText("Value not known yet")
    // The sample-data strip stays on top of the list.
    await expect(deals(page).getByTestId("sample-data-strip")).toBeVisible()
    await expect(deals(page).getByRole("heading", { level: 2, name: "Open deals" })).toBeVisible()
    await expect(deals(page).getByText("2 overdue")).toBeVisible()

    // Add deal sits in the page header at 44px; the toolbar copy is hidden.
    const add = screen(page).locator("header").getByRole("button", { name: "Add deal", exact: true })
    await expectTapTarget(add, "Add deal")
    await expect(deals(page).getByRole("button", { name: "Add deal", exact: true })).toBeHidden()

    // Filter: full width, four equal 44px segments.
    const group = deals(page).getByRole("group", { name: "Show deals" })
    const groupBox = (await group.boundingBox())!
    const dealsBox = (await deals(page).boundingBox())!
    expect(Math.abs(groupBox.width - dealsBox.width)).toBeLessThanOrEqual(1)
    const widths: number[] = []
    for (const name of ["Open", "Won", "Lost", "All"]) {
      const seg = group.getByRole("button", { name, exact: true })
      await expectTapTarget(seg, `filter ${name}`)
      widths.push((await seg.boundingBox())!.width)
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    await expectNoOverflowX(page)
    await expectAllTargets44(main(page), "390 main")
  })

  test("a card opens the bottom sheet; its actions are 44+ tall and open the existing dialogs", async ({ page }) => {
    await fresh(page)
    const who = "Coach Lonnie Pruitt"
    await card(page, who).click()
    const s = sheet(page, who)
    await expect(s).toBeVisible()
    await expect(s).toHaveAttribute("data-side", "bottom")
    await expect(s).toContainText("Owner Skye · Last touch")
    await expect(s.locator('[data-overdue="true"]')).toContainText("Overdue 2 days")

    const actions = sheetActions(page, who)
    await expect(actions).toHaveCount(4)
    await expect(actions.nth(0)).toContainText("Move stage")
    await expect(actions.nth(1)).toHaveText("Next step done")
    await expect(actions.nth(2)).toHaveText("Edit deal")
    await expect(actions.nth(3)).toHaveText("Delete deal")
    for (let i = 0; i < 4; i++) {
      const box = (await actions.nth(i).boundingBox())!
      expect(box.height, `sheet action ${i}`).toBeGreaterThanOrEqual(44)
    }
    await expectAllTargets44(s, "390 sheet")
    await expectNoOverflowX(page)

    // Escape closes and hands focus back to the card.
    await page.keyboard.press("Escape")
    await expect(s).toBeHidden()
    await expect(card(page, who)).toBeFocused()

    // Edit deal → the existing Edit dialog, prefilled; closing returns to the card.
    await card(page, who).click()
    await sheetActions(page, who).filter({ hasText: "Edit deal" }).click()
    const edit = dialog(page, "Edit deal")
    await expect(edit).toBeVisible()
    await expect(s).toBeHidden()
    await expect(edit.getByRole("textbox", { name: "Who" })).toHaveValue(who)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
    await expect(card(page, who)).toBeFocused()

    // Next step done → the existing dialog, same wording.
    await card(page, who).click()
    await sheetActions(page, who).filter({ hasText: "Next step done" }).click()
    await expect(dialog(page, "Next step done")).toContainText(`is done for ${who}`)
    await page.keyboard.press("Escape")
    await expect(dialog(page, "Next step done")).toBeHidden()

    // Move stage → the stage menu.
    await card(page, who).click()
    await sheetActions(page, who).filter({ hasText: "Move stage" }).click()
    await page.getByRole("menu").getByRole("menuitemradio", { name: "Proposal" }).click()
    await expect(sheetActions(page, who).first()).toContainText("Proposal")
    await page.keyboard.press("Escape")
    await expect(sheet(page, who)).toBeHidden()

    // Delete deal → the existing confirm.
    await card(page, "Dana Alvarez").click()
    await sheetActions(page, "Dana Alvarez").filter({ hasText: "Delete deal" }).click()
    await dialog(page, "Delete this deal?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(card(page, "Dana Alvarez")).toHaveCount(0)
    await expect(cards(page)).toHaveCount(5)
  })

  test("the sheet traps focus", async ({ page }) => {
    await fresh(page)
    await card(page, "Coach Reggie Okafor").click()
    const s = sheet(page, "Coach Reggie Okafor")
    await expect(s).toBeVisible()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab")
      expect(await s.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1}`).toBe(true)
    }
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive Sales (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("keeps a 5-column table with one 44×44 ellipsis per row", async ({ page }) => {
      await fresh(page)
      await expect(cardList(page)).toBeHidden()
      await expect(rows(page)).toHaveCount(6)
      await expect(table(page).getByRole("columnheader")).toHaveText([
        "Who",
        "Value",
        "Stage",
        "Next step",
        "Actions",
      ])

      // Folded sublines: Owner · Last touch under Who, What under Value.
      const treadwell = row(page, /Treadwell/)
      await expect(treadwell.getByText(/^Rashad · /)).toBeVisible()
      // Visible cells only (the folded columns are display:none): Who, Value, Stage, Next step, actions.
      await expect(treadwell.getByRole("cell")).toHaveCount(5)
      await expect(treadwell.getByRole("cell").nth(1)).toContainText("$12,000")
      await expect(treadwell.getByRole("cell").nth(1)).toContainText("Program license")
      await expect(treadwell.getByRole("button", { name: "Edit Coach Marcus Treadwell" })).toBeHidden()

      const more = treadwell.getByRole("button", { name: "More actions for Coach Marcus Treadwell" })
      await expectTapTarget(more, "ellipsis")
      const box = (await more.boundingBox())!
      expect(Math.round(box.width)).toBe(44)
      expect(Math.round(box.height)).toBe(44)
      // Every row's ellipsis is on screen, not scrolled off inside the table.
      for (const btn of await table(page).getByRole("button", { name: /^More actions for / }).all()) {
        const b = (await btn.boundingBox())!
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
          { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        )
        expect(hit).toBe(await btn.getAttribute("aria-label"))
      }

      await more.click()
      const menu = page.getByRole("menu")
      await expect(menu.getByRole("menuitem")).toHaveText(["Next step done", "Edit deal", "Delete deal"])
      await menu.getByRole("menuitem", { name: "Edit deal" }).click()
      const edit = dialog(page, "Edit deal")
      await expect(edit.getByRole("textbox", { name: "Who" })).toHaveValue("Coach Marcus Treadwell")
      await page.keyboard.press("Escape")
      await expect(edit).toBeHidden()
      await expect(more).toBeFocused()

      // Sortable headers still sort.
      const whoHead = table(page).getByRole("columnheader", { name: "Who" })
      await whoHead.getByRole("button").click()
      await expect(whoHead).toHaveAttribute("aria-sort", "ascending")
      await expect(rows(page).first()).toContainText("Coach Darnell Whitaker")

      // Toolbar: 44 tall filter, chip and Add deal.
      await expect(deals(page).getByTestId("source-chip")).toHaveCSS("height", "44px")
      await expectTapTarget(deals(page).getByRole("button", { name: "Add deal", exact: true }), "Add deal")

      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      await expectNoOverflowX(page)
      await expectAllTargets44(main(page), `${VIEWPORTS[name].width} main`)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Sales (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: 8 columns, three inline row actions, no cards", async ({ page }) => {
    await fresh(page)
    await expect(cards(page).first()).toBeHidden()
    await expect(cardList(page)).toBeHidden()
    await expect(table(page).getByRole("columnheader")).toHaveText([
      "Who",
      "What they're buying",
      "Value",
      "Stage",
      "Next step",
      "Owner",
      "Last touch",
      "Actions",
    ])
    const pruitt = row(page, /Pruitt/)
    await expect(pruitt.getByRole("button", { name: "Mark next step done for Coach Lonnie Pruitt" })).toBeVisible()
    await expect(pruitt.getByRole("button", { name: "Edit Coach Lonnie Pruitt" })).toBeVisible()
    await expect(pruitt.getByRole("button", { name: "Delete Coach Lonnie Pruitt" })).toBeVisible()
    await expect(pruitt.getByRole("button", { name: /More actions/ })).toBeHidden()
    await expect(pruitt.getByText(/^Skye · /)).toBeHidden()
    await expect(screen(page).locator("header").getByRole("button", { name: "Add deal" })).toBeHidden()
    await expect(deals(page).getByRole("button", { name: "Add deal", exact: true })).toBeVisible()
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
    test.describe(`readable Sales (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const label = `${theme}/${size}`
        // The header minus the shared note's *disabled* Reset (opacity 0.5 by
        // design; WCAG 1.4.3 exempts inactive controls).
        const header = screen(page).locator("header")
        await expectReadable(header.getByRole("heading", { level: 1 }), `${label}/title`, expect)
        await expectReadable(header.locator("p").first(), `${label}/subtitle`, expect)
        await expectReadable(persistenceNote(page), `${label}/note`, expect)
        await expectReadable(header.getByTestId("sample-data-tag"), `${label}/header tag`, expect)
        await expectReadable(deals(page), `${label}/deals`, expect)
        if (size === "390") {
          await card(page, "Coach Lonnie Pruitt").click()
          const s = sheet(page, "Coach Lonnie Pruitt")
          await expect(s).toBeVisible()
          await expectReadable(s, `${label}/sheet`, expect)
        } else {
          await row(page, /Pruitt/).getByRole("button", { name: /More actions/ }).click()
          await expectReadable(page.getByRole("menu"), `${label}/row menu`, expect)
        }
      })
    })
  }
}
