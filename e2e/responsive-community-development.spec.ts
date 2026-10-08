import { expect, test, type Locator, type Page } from "@playwright/test"

import { ROW_COLLAPSE_SLOT } from "../src/components/responsive-table"
import { expectReadable, settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
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
 * Community Development at phone / tablet / desktop (Deke 7:47, Clinics 10:821
 * / 10:1281). Phone stacks RowCollapse cards with the edit form as a bottom
 * sheet; tablet keeps a 5-column table with one 44px ellipsis per row;
 * desktop (≥1280) is unchanged. 1180 uses the 820 layout.
 */

const STORAGE_KEY = "hotdash.community-development.v1"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const YATES = "Equipment drive for Yates High School"
const ALIEF = "Saturday volunteer coaching at Alief rec"

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const section = (page: Page) => page.getByRole("region", { name: "Giving initiatives", exact: true })
const table = (page: Page) => section(page).getByRole("table", { name: "Giving initiatives", exact: true })
const cards = (page: Page) => section(page).locator(`[data-slot='${ROW_COLLAPSE_SLOT}']:visible`)
const card = (page: Page, name: string) =>
  section(page).getByRole("list").getByRole("button", { name: new RegExp(`^${name}`) })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const addButton = (page: Page) => header(page).getByRole("button", { name: "Add initiative", exact: true })
const resetButton = (page: Page) => header(page).getByRole("button", { name: "Reset", exact: true })

async function fresh(page: Page) {
  await page.goto("/community-development")
  await waitForHydration(page)
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
  "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='option'], [role='combobox'], [role='checkbox'], [role='switch'], [role='tab'], [tabindex]:not([tabindex='-1'])"

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

async function expectUnclipped(locator: Locator, label: string) {
  const box = await locator.evaluate((el) => ({
    scroll: (el as HTMLElement).scrollHeight,
    client: (el as HTMLElement).clientHeight,
  }))
  expect(box.scroll, `${label}: content not clipped`).toBeLessThanOrEqual(box.client + 1)
}

async function expectNoPageOverflowX(page: Page) {
  expect(await pageOverflowX(page), "horizontal overflow").toBeLessThanOrEqual(1)
}

async function expectNoTableScrollX(tbl: Locator, label: string) {
  const extra = await tbl.evaluate((el) => {
    const scroller = el.closest("[data-slot='responsive-table']") ?? el
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(extra, `${label} table horizontal scroll ${extra}px`).toBeLessThanOrEqual(1)
}

async function expectFullyInside(inner: Locator, outer: Locator, label: string) {
  const [i, o] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  expect(i, label).toBeTruthy()
  expect(o, `${label} container`).toBeTruthy()
  expect(i!.x, `${label} left`).toBeGreaterThanOrEqual(o!.x - 1)
  expect(i!.y, `${label} top`).toBeGreaterThanOrEqual(o!.y - 1)
  expect(i!.x + i!.width, `${label} right`).toBeLessThanOrEqual(o!.x + o!.width + 1)
  expect(i!.y + i!.height, `${label} bottom`).toBeLessThanOrEqual(o!.y + o!.height + 1)
}

async function visibleHeaders(tbl: Locator) {
  return tbl.getByRole("columnheader").evaluateAll((els) =>
    els.map((el) => el.textContent?.trim() ?? "").filter((t) => t && t !== "Actions")
  )
}

async function backgroundContrast(a: Locator, b: Locator) {
  return a.evaluate((elA, elB) => {
    const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", {
      willReadFrequently: true,
    })!
    const parse = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "rgba(0, 0, 0, 0)"
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const over = (top: ReturnType<typeof parse>, under: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    })
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
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
  await settleAnimations(group.page())
  const ratio = await backgroundContrast(pressed, unpressed)
  expect(ratio, `${label} pressed vs unpressed ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
  await expectReadable(pressed, `${label} pressed`, expect)
}

async function expectImpactUnclipped(form: Locator, label: string) {
  const impact = form.getByLabel("What we gave / impact")
  await impact.scrollIntoViewIfNeeded()
  await impact.fill("x".repeat(200))
  await expectUnclipped(impact, `${label} 200`)
  await impact.evaluate((el) => {
    const node = el as HTMLTextAreaElement
    node.value = "x".repeat(280)
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await expectUnclipped(impact, `${label} 280`)
}

type Size = "390" | "820" | "1180"

async function openEdit(page: Page, size: Size) {
  if (size === "390") {
    await card(page, YATES).click()
    return dialog(page, "Edit initiative")
  }
  await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  return dialog(page, "Edit initiative")
}

async function expectDialogs44(page: Page, size: Size) {
  await addButton(page).click()
  const add = dialog(page, "Add initiative")
  await expect(add).toBeVisible()
  await settleAnimations(page)
  await expectAllTargets44(add, `${size} Add dialog`)
  await expectTapTarget(add.getByRole("button", { name: "Close", exact: true }), `${size} Add ×`)
  await expect(add, `${size} Add fits the screen`).toBeInViewport({ ratio: 1 })
  await expectImpactUnclipped(add, `${size} Add impact`)
  if (size === "390") {
    const date = (await add.getByLabel("Date").boundingBox())!
    const cadence = (await add.getByLabel("Cadence").boundingBox())!
    expect(cadence.y, "Cadence sits under Date").toBeGreaterThan(date.y + date.height)
    expect(Math.abs(cadence.width - date.width)).toBeLessThanOrEqual(2)
    const foundation = (await add.getByRole("button", { name: "Foundation program", exact: true }).boundingBox())!
    const outreach = (await add.getByRole("button", { name: "Outreach event", exact: true }).boundingBox())!
    expect(Math.abs(outreach.y - foundation.y), "Outreach event shares a row with Foundation program").toBeLessThanOrEqual(
      4
    )
  }
  await page.keyboard.press("Escape")
  await expect(add).toBeHidden()

  const edit = await openEdit(page, size)
  await expect(edit).toBeVisible()
  await settleAnimations(page)
  await expectAllTargets44(edit, `${size} Edit dialog`)
  await expectTapTarget(edit.getByRole("button", { name: "Close", exact: true }), `${size} Edit ×`)
  await expect(edit, `${size} Edit fits the screen`).toBeInViewport({ ratio: 1 })
  if (size === "390") {
    await expect(edit).toHaveAttribute("data-side", "bottom")
    await expectMinDelete(edit)
    await expectTapTarget(edit.getByRole("button", { name: "View", exact: true }), `${size} Edit View`)
  } else {
    await expect(edit.getByRole("button", { name: "Delete initiative", exact: true })).toHaveCount(0)
    await expect(edit.getByRole("button", { name: "View", exact: true })).toHaveCount(0)
    const owner = (await edit.getByLabel("Owner").boundingBox())!
    const impact = (await edit.getByLabel("What we gave / impact").boundingBox())!
    expect(Math.abs(owner.y - impact.y), `${size} Owner aligns with Impact`).toBeLessThanOrEqual(2)
  }
  await page.keyboard.press("Escape")
  await expect(edit).toBeHidden()

  if (size === "390") {
    await card(page, YATES).click()
    await dialog(page, "Edit initiative").getByRole("button", { name: "Delete initiative", exact: true }).click()
  } else {
    await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await expectAllTargets44(menu, `${size} row menu`)
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
  }
  const confirm = dialog(page, "Delete this initiative?")
  await expect(confirm).toBeVisible()
  await expectAllTargets44(confirm, `${size} delete-confirm`)
  await expectTapTarget(confirm.getByRole("button", { name: "Close", exact: true }), `${size} delete ×`)
  await page.keyboard.press("Escape")
  await expect(confirm).toBeHidden()
}

async function expectMinDelete(edit: Locator) {
  const remove = edit.getByRole("button", { name: "Delete initiative", exact: true })
  await expect(remove).toBeVisible()
  await expectTapTarget(remove, "phone Delete initiative")
}

/* ------------------------------------------------------------------ phone */

test.describe("responsive Community Development (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("records are cards, no table, no overflow, 44px Add, readable light and dark", async ({
    page,
  }) => {
    await fresh(page)
    await expect(cards(page)).toHaveCount(8)
    await expect(table(page)).toHaveCount(0)
    await expect(card(page, YATES)).toContainText("Donation · Yates High School football")
    await expect(card(page, YATES)).toContainText("Skye")
    await expect(card(page, YATES).getByTestId("status-pill")).toHaveText("Active")
    await expect(card(page, YATES).getByTestId("sample-data-tag")).toBeVisible()
    await expectTapTarget(addButton(page), "phone Add initiative")
    await expectTapTarget(resetButton(page), "phone Reset")
    await expectTapTarget(cards(page).first(), "phone card")
    await expectNoPageOverflowX(page)
    await expectNoOverflowX(page)

    const outreach = page.getByRole("group", { name: "Filter by type" }).getByRole("button", {
      name: "Outreach event",
      exact: true,
    })
    const outreachBox = await outreach.boundingBox()
    const viewport = page.viewportSize()
    expect(outreachBox, "Outreach event painted").toBeTruthy()
    expect(viewport, "viewport").toBeTruthy()
    expect(outreachBox!.x, "Outreach event starts on screen").toBeGreaterThan(0)
    expect(outreachBox!.x, "Outreach event peeks from the right").toBeLessThan(viewport!.width)
    expect(outreachBox!.x + outreachBox!.width, "Outreach event is not fully on screen").toBeGreaterThan(
      viewport!.width - 1
    )
    await expect(page.getByTestId("cd-filters-fade")).toBeVisible()

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(header(page).getByRole("heading", { level: 1 }), `${theme}/h1`, expect)
      await expectReadable(card(page, YATES), `${theme}/card`, expect)
      await expectReadable(card(page, YATES).getByTestId("status-pill"), `${theme}/status`, expect)
    }
    await setTheme(page, "light")
  })

  test("a card opens the existing edit form as a bottom sheet", async ({ page }) => {
    await fresh(page)
    await card(page, YATES).click()
    const edit = dialog(page, "Edit initiative")
    await expect(edit).toBeVisible()
    await expect(edit).toHaveAttribute("data-side", "bottom")
    await expect(edit.getByLabel("Name")).toHaveValue(YATES)
    await expectAllTargets44(edit, "390 sheet")
    await expectTapTarget(edit.getByRole("button", { name: "Close", exact: true }), "sheet close")
    await expectMinDelete(edit)
    await expectTapTarget(edit.getByRole("button", { name: "View", exact: true }), "phone View")
    await expectImpactUnclipped(edit, "phone sheet")
    await expectNoPageOverflowX(page)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
    await expect(card(page, YATES)).toBeFocused()
  })

  test("the sheet's × (44×44) and a backdrop tap close it; focus returns to the card; focus is trapped", async ({
    page,
  }) => {
    await fresh(page)
    await card(page, YATES).click()
    const s = dialog(page, "Edit initiative")
    await expect(s).toBeVisible()
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, s)

    const close = s.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "sheet ×")
    const box = (await close.boundingBox())!
    expect(Math.round(box.width)).toBe(44)
    expect(Math.round(box.height)).toBe(44)
    await close.click()
    await expect(s).toBeHidden()
    await expect(card(page, YATES)).toBeFocused()
    await expectScrollLock(page, false)

    await card(page, YATES).click()
    await expect(s).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(s).toBeHidden()
    await expect(card(page, YATES)).toBeFocused()
    await expectScrollLock(page, false)
  })

  test("after Delete from the sheet, focus moves to the card now in its place", async ({ page }) => {
    await fresh(page)
    const names = await cards(page).evaluateAll((els) => els.map((el) => el.textContent ?? ""))
    const i = names.findIndex((n) => n.startsWith(YATES))
    expect(i).toBeGreaterThanOrEqual(0)
    const nextHandle = cards(page).nth(i + 1)
    const nextName = (await nextHandle.textContent())!
    await card(page, YATES).click()
    await dialog(page, "Edit initiative").getByRole("button", { name: "Delete initiative", exact: true }).click()
    await dialog(page, "Delete this initiative?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(card(page, YATES)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(7)
    await expect(cards(page).nth(i)).toBeFocused()
    await expect(cards(page).nth(i)).toHaveText(nextName)
    expect(nextName).toContain(ALIEF)
  })

  test("dialogs are 44px: fields, options, buttons, ×; two-column grids stack", async ({ page }) => {
    await fresh(page)
    await expectDialogs44(page, "390")
  })

  test("View from the edit sheet is full width; × closes it and focus returns to the card", async ({
    page,
  }) => {
    await fresh(page)
    await card(page, YATES).click()
    const edit = dialog(page, "Edit initiative")
    await expect(edit).toBeVisible()
    await edit.getByRole("button", { name: "View", exact: true }).click()
    await expect(edit).toBeHidden()
    const view = page.getByRole("dialog", { name: new RegExp(`^${YATES}`) })
    await expect(view).toBeVisible()
    await expect(view).toHaveAttribute("data-side", "right")
    const box = (await view.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.width, "View sheet is full width").toBeGreaterThanOrEqual(viewport.width - 2)
    expect(box.x, "View sheet starts at the left edge").toBeLessThanOrEqual(1)
    const close = view.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "View ×")
    await close.click()
    await expect(view).toBeHidden()
    await expect(card(page, YATES)).toBeFocused()
  })

  test("empty state Add is 44px and does not overflow", async ({ page }) => {
    await page.goto("/community-development")
    await waitForHydration(page)
    await page.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ initiatives: [], nextId: 9 })),
      STORAGE_KEY
    )
    await page.reload()
    await waitForHydration(page)
    const empty = page.getByRole("status", { name: "No initiatives", exact: true })
    await expect(empty).toBeVisible()
    await expectTapTarget(empty.getByRole("button", { name: "Add initiative", exact: true }), "empty Add")
    await expectNoPageOverflowX(page)
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive Community Development (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("keeps a 5-column table with one 44×44 ellipsis per row", async ({ page }) => {
      await fresh(page)
      await expect(table(page)).toBeVisible()
      await expect(cards(page)).toHaveCount(0)
      expect(await visibleHeaders(table(page))).toEqual(["Name", "Type", "When", "Status", "Owner"])
      await expectTapTarget(addButton(page), `${VIEWPORTS[name].width} Add`)
      await expectTapTarget(resetButton(page), `${VIEWPORTS[name].width} Reset`)

      const menu = table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true })
      await expectTapTarget(menu, `${VIEWPORTS[name].width} row menu`)
      const box = (await menu.boundingBox())!
      expect(Math.round(box.width)).toBe(44)
      expect(Math.round(box.height)).toBe(44)
      await expect(menu).toHaveCSS("opacity", "1")

      const yates = table(page).getByRole("row", { name: /Equipment drive for Yates/ })
      await expect(yates).toContainText("Yates High School football")
      await expect(yates.getByTestId("status-pill")).toBeVisible()
      const cardBox = section(page).locator("[data-slot='responsive-table']")
      await expectFullyInside(yates.getByTestId("status-pill"), cardBox, "status")
      await expectFullyInside(menu, cardBox, "row menu")
      await expectNoTableScrollX(table(page), "initiatives")
      await expectNoPageOverflowX(page)
      await expectNoOverflowX(page)

      await menu.click()
      const open = page.getByRole("menu")
      await expect(open.getByRole("menuitem")).toHaveText([
        "View",
        "Edit",
        "Mark idea",
        "Mark planned",
        "Mark done",
        /Could spawn a Clinic/,
        "Delete",
      ])
      await expectAllTargets44(open, `${VIEWPORTS[name].width} row menu items`)
      await open.getByRole("menuitem", { name: "Edit", exact: true }).click()
      const edit = dialog(page, "Edit initiative")
      await expect(edit.getByLabel("Name")).toHaveValue(YATES)
      await expect(edit.getByRole("button", { name: "Delete initiative", exact: true })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(edit).toBeHidden()
    })

    test("the Yates name is left-aligned, single-line, and not clipped vertically", async ({ page }) => {
      await fresh(page)
      const yates = table(page).getByRole("row", { name: /Equipment drive for Yates/ })
      const name = yates.getByTestId("initiative-name")
      await expect(name).toBeVisible()
      await expect(name).toHaveAttribute("title", YATES)
      const paint = await name.evaluate((el) => {
        const cell = el.closest("td")
        if (!cell) return null
        const node = (el.querySelector("span") ?? el).firstChild
        if (!(node instanceof Text)) return null
        const word = node.data.trim().split(/\s+/)[0] ?? ""
        const range = document.createRange()
        range.setStart(node, 0)
        range.setEnd(node, word.length)
        const wr = range.getBoundingClientRect()
        const nr = el.getBoundingClientRect()
        const cr = cell.getBoundingClientRect()
        const pad = parseFloat(getComputedStyle(cell).paddingLeft)
        return {
          nameLeft: nr.x,
          contentLeft: cr.x + pad,
          scrollHeight: (el as HTMLElement).scrollHeight,
          clientHeight: (el as HTMLElement).clientHeight,
          word,
          wordLeft: wr.x,
          wordRight: wr.x + wr.width,
          wordTop: wr.y,
          wordBottom: wr.y + wr.height,
          elLeft: nr.x,
          elRight: nr.x + nr.width,
          elTop: nr.y,
          elBottom: nr.y + nr.height,
        }
      })
      expect(paint, `${VIEWPORTS[name].width} Yates name painted`).toBeTruthy()
      expect(paint!.word, `${VIEWPORTS[name].width} first word`).toBe("Equipment")
      expect(paint!.nameLeft, `${VIEWPORTS[name].width} name starts at the cell's left edge`).toBeLessThanOrEqual(
        paint!.contentLeft + 1
      )
      expect(paint!.nameLeft, `${VIEWPORTS[name].width} name is not inset past the cell padding`).toBeGreaterThanOrEqual(
        paint!.contentLeft - 1
      )
      expect(paint!.scrollHeight, `${VIEWPORTS[name].width} name not clipped vertically`).toBeLessThanOrEqual(
        paint!.clientHeight + 1
      )
      expect(paint!.wordLeft, `${VIEWPORTS[name].width} Equipment left`).toBeGreaterThanOrEqual(paint!.elLeft - 1)
      expect(paint!.wordRight, `${VIEWPORTS[name].width} Equipment right`).toBeLessThanOrEqual(paint!.elRight + 1)
      expect(paint!.wordTop, `${VIEWPORTS[name].width} Equipment top`).toBeGreaterThanOrEqual(paint!.elTop - 1)
      expect(paint!.wordBottom, `${VIEWPORTS[name].width} Equipment bottom`).toBeLessThanOrEqual(paint!.elBottom + 1)
    })

    test("dialogs and the row menu are 44px: fields, options, buttons, ×, menu rows", async ({
      page,
    }) => {
      await fresh(page)
      await expectDialogs44(page, String(VIEWPORTS[name].width) as Size)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Community Development (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("keeps the seven-column table and the Nova sm Add; no cards", async ({ page }) => {
    await fresh(page)
    await expect(table(page)).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    expect(await visibleHeaders(table(page))).toEqual([
      "Name",
      "Type",
      "Partner",
      "When",
      "Status",
      "Owner",
      "Impact",
    ])
    const add = addButton(page)
    const box = await add.boundingBox()
    expect(box, "desktop Add").toBeTruthy()
    expect(box!.height, "desktop Add stays Nova sm, not 44").toBeLessThan(44)
    const resetBox = await resetButton(page).boundingBox()
    expect(resetBox, "desktop Reset").toBeTruthy()
    expect(resetBox!.height, "desktop Reset stays PersistenceNote h-6").toBeLessThan(44)

    const yates = table(page).getByRole("row", { name: /Equipment drive for Yates/ })
    await expect(yates.getByRole("cell").nth(2)).toHaveText("Yates High School football")
    await expect(yates.locator(".xl\\:hidden").first()).toBeHidden()
    await expectNoPageOverflowX(page)

    await yates.getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const edit = dialog(page, "Edit initiative")
    await expect(edit).toBeVisible()
    await settleAnimations(page)
    await expect(edit.getByLabel("Name")).toHaveCSS("height", "32px")
    await expect(edit.getByRole("button", { name: "Save changes" })).toHaveCSS("height", "32px")
    await expect(edit.getByRole("button", { name: "Close", exact: true })).toHaveCSS("height", "28px")
    await expect(edit.getByRole("button", { name: "Delete initiative", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()
  })
})

/* ------------------------------------------------------- filter contrast */

const PRESSED_SIZES = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
  ["1440", VIEWPORTS.desktop],
] as const

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of PRESSED_SIZES) {
    test.describe(`Community Development filter pressed contrast (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`the picked filter is ≥3:1 against the rest in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        for (const name of ["Filter by type", "Filter by status"] as const) {
          const group = page.getByRole("group", { name })
          await expectPressedContrast(group, `${theme}/${size} ${name}`)
        }
      })
    })
  }
}

/* --------------------------------------------------------------- readable */

const READABLE = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of READABLE) {
    test.describe(`readable Community Development (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const label = `${theme}/${size}`
        await expectReadable(header(page).getByRole("heading", { level: 1 }), `${label}/title`, expect)
        await expectReadable(header(page).locator("p").first(), `${label}/lede`, expect)
        await expectReadable(persistenceNote(page), `${label}/note`, expect)
        await expectReadable(header(page).getByTestId("sample-data-tag"), `${label}/header tag`, expect)
        await expectReadable(page.getByRole("group", { name: "Giving summary" }), `${label}/summary`, expect)
        if (size === "390") {
          await expectReadable(card(page, YATES), `${label}/card`, expect)
          await card(page, YATES).click()
          const s = dialog(page, "Edit initiative")
          await expect(s).toBeVisible()
          await expectReadable(s.getByRole("heading", { name: "Edit initiative" }), `${label}/sheet title`, expect)
          await expectReadable(s.getByRole("button", { name: "Close", exact: true }), `${label}/sheet ×`, expect)
          await expectReadable(s.getByRole("button", { name: "View", exact: true }), `${label}/sheet View`, expect)
          await expectReadable(
            s.getByRole("button", { name: "Delete initiative", exact: true }),
            `${label}/sheet Delete`,
            expect
          )
          await page.keyboard.press("Escape")
          await expect(s).toBeHidden()
        } else {
          await expectReadable(table(page), `${label}/table`, expect)
          await table(page).getByRole("button", { name: `Actions for ${YATES}` }).click()
          const menu = page.getByRole("menu")
          await expect(menu).toBeVisible()
          // Enabled items only — Spawn is develop's disabled opacity-50
          // (WCAG 1.4.3 exempts inactive controls), same as Sales Reset.
          await expectReadable(menu.getByRole("menuitem", { name: "View", exact: true }), `${label}/menu View`, expect)
          await expectReadable(menu.getByRole("menuitem", { name: "Edit", exact: true }), `${label}/menu Edit`, expect)
          await expectReadable(menu.getByRole("menuitem", { name: "Delete", exact: true }), `${label}/menu Delete`, expect)
          await page.keyboard.press("Escape")
        }

        await addButton(page).click()
        const add = dialog(page, "Add initiative")
        await expect(add).toBeVisible()
        await add.getByLabel("Name").fill("Saturday park clean-up")
        await expectReadable(add.locator('[data-slot="dialog-header"]'), `${label}/add header`, expect)
        await expectReadable(add.getByRole("button", { name: "Add initiative", exact: true }), `${label}/add submit`, expect)
        await page.keyboard.press("Escape")

        await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ initiatives: [], nextId: 1 })), STORAGE_KEY)
        await page.reload()
        await waitForHydration(page)
        await expect(persistenceNote(page)).toHaveText(NOTE.saved)
        const reset = header(page).getByRole("button", { name: "Reset", exact: true })
        await expect(reset).toBeEnabled()
        await expectTapTarget(reset, `${label}/Reset`)
        await expectReadable(reset, `${label}/enabled Reset`, expect)
      })
    })
  }
}
