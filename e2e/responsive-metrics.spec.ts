import { expect, test, type Locator, type Page } from "@playwright/test"

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
 * Metrics at phone / tablet / desktop (Deke 7:47, 17:68, Expenses pin 7:141).
 * Phone: stacked subscriber cards, pinned Expenses column, sheets for Add.
 * Tablet: ≤5-column tables. Desktop (≥1280) is develop plus pressed primary.
 */

const STORAGE_KEY = "hotdash.metrics.v2"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const panel = (page: Page, name: "Overview" | "New Subscribers" | "Churned Subscribers" | "Expenses") =>
  page.getByRole("tabpanel", { name, exact: true })
const grid = (page: Page) => panel(page, "Overview").getByRole("region", { name: "Metric cards" })
const card = (page: Page, name: string) =>
  grid(page).getByRole("article", { name: new RegExp(`^${name}\\b`) })
const expensesCard = (page: Page) =>
  panel(page, "Expenses").getByRole("article", { name: /^Expenses\b/ })
const tab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Metrics views" }).getByRole("tab", { name, exact: true })
const tablist = (page: Page) => page.getByRole("tablist", { name: "Metrics views" })
const table = (page: Page, name: "New subscribers" | "Churned subscribers" | "Expenses") => {
  const owner =
    name === "New subscribers"
      ? "New Subscribers"
      : name === "Churned subscribers"
        ? "Churned Subscribers"
        : "Expenses"
  return panel(page, owner).getByRole("table", { name, exact: true })
}
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function fresh(page: Page, path = "/metrics") {
  await page.goto(path)
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
      const formValue = el.tagName === "INPUT" && el.getAttribute("aria-hidden") === "true"
      const disabled = el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled
      const wrap = el.closest("label")
      return {
        name: `${el.tagName.toLowerCase()} "${name}"`,
        role: el.getAttribute("role"),
        accessibleName: name,
        width: r.width,
        height: r.height,
        labelHeight: wrap?.getBoundingClientRect().height ?? 0,
        painted: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !formValue && !disabled,
      }
    })
  )
  const painted = measured.filter((m) => m.painted)
  expect(painted.length, `${label}: controls measured`).toBeGreaterThan(0)

  const small: string[] = []
  for (const m of painted) {
    if (m.width >= 44 && m.height >= 44) continue
    if (m.role === "switch" && m.labelHeight >= 44) {
      const sw = scope.getByRole("switch", { name: m.accessibleName, exact: true })
      const wrap = sw.locator("xpath=ancestor::label[1]")
      const before = await sw.getAttribute("aria-checked")
      await wrap.click()
      const after = await sw.getAttribute("aria-checked")
      if (after && after !== before) {
        await wrap.click()
        await expect(sw).toHaveAttribute("aria-checked", before ?? "false")
        continue
      }
    }
    small.push(`${m.name} ${m.width.toFixed(1)}×${m.height.toFixed(1)}`)
  }
  expect(small, `${label}: every control ≥ 44×44`).toEqual([])
}

async function expectUnclipped(locator: Locator, label: string) {
  const box = await locator.evaluate((el) => ({
    scroll: (el as HTMLElement).scrollHeight,
    client: (el as HTMLElement).clientHeight,
  }))
  expect(box.scroll, `${label}: content not clipped`).toBeLessThanOrEqual(box.client + 1)
}

/**
 * WCAG contrast between painted backgrounds (pressed vs unpressed). Copied
 * locally from the Feature Request spec so e2e/support stays untouched.
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
    const over = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({
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
}

async function settle(locator: Locator) {
  await settleAnimations(locator.page())
}

/* ------------------------------------------------------------------ phone */

test.describe("responsive Metrics (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("tabs stay reachable with a peek and fade, and the page does not scroll sideways", async ({
    page,
  }) => {
    await fresh(page)
    await expect(main(page).getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true")
    await expect(grid(page).getByRole("article")).toHaveCount(8)

    for (const name of ["Overview", "New Subscribers", "Churned Subscribers", "Expenses"]) {
      await expectTapTarget(tab(page, name), `tab ${name}`)
    }

    const list = tablist(page)
    const overflow = await list.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, "tablist scrolls sideways").toBeGreaterThan(8)
    const peek = tab(page, "Expenses")
    const peekBox = await peek.boundingBox()
    const viewport = page.viewportSize()
    expect(peekBox, "Expenses painted").toBeTruthy()
    expect(viewport, "viewport").toBeTruthy()
    expect(peekBox!.x, "Expenses starts on screen").toBeGreaterThan(0)
    expect(peekBox!.x, "Expenses peeks from the right").toBeLessThan(viewport!.width)
    expect(peekBox!.x + peekBox!.width, "Expenses is not fully on screen").toBeGreaterThan(
      viewport!.width - 1
    )
    await expect(page.getByTestId("metrics-tabs-fade")).toBeVisible()

    await tab(page, "Expenses").click()
    await expect(page).toHaveURL(/tab=expenses/)
    await expect(expensesCard(page)).toBeVisible()

    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    await expectNoOverflowX(page)
  })

  test("New and Churned are stacked cards; Expenses pins Category", async ({ page }) => {
    await fresh(page, "/metrics?tab=new")
    const newList = panel(page, "New Subscribers").getByRole("list")
    await expect(newList.getByRole("listitem")).toHaveCount(8)
    await expect(newList.getByText("Alisha Patel")).toBeVisible()
    await expect(newList.getByText("Monthly").first()).toBeVisible()
    await expect(table(page, "New subscribers")).toHaveCount(0)

    await tab(page, "Churned Subscribers").click()
    const churnList = panel(page, "Churned Subscribers").getByRole("list")
    await expect(churnList.getByRole("listitem")).toHaveCount(5)
    await expect(churnList.getByText("Brett Holloway")).toBeVisible()
    await expect(table(page, "Churned subscribers")).toHaveCount(0)

    await tab(page, "Expenses").click()
    const expenses = table(page, "Expenses")
    await expect(expenses).toBeVisible()
    await expect(expenses.getByRole("columnheader", { name: /Category/ })).toBeVisible()
    await expect(page.getByTestId("metrics-expenses-fade")).toBeVisible()
    await expect(expenses.getByRole("row", { name: /AWS/ })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("the Add metric sheet's × (44×44) and a backdrop tap close it; focus returns; focus is trapped", async ({
    page,
  }) => {
    await fresh(page)
    const add = panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true })
    await add.click()
    const sheet = dialog(page, "Add a metric")
    await expect(sheet).toBeVisible()
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, sheet)

    const close = sheet.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "Add metric ×")
    await close.click()
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
    await expectScrollLock(page, false)

    await add.click()
    await expect(sheet).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
    await expectScrollLock(page, false)
  })

  test("the Add expense sheet's × and a backdrop tap close it; focus returns; focus is trapped", async ({
    page,
  }) => {
    await fresh(page, "/metrics?tab=expenses")
    const add = panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true })
    await add.click()
    const sheet = dialog(page, "Add expense")
    await expect(sheet).toBeVisible()
    await expect(sheet, "sheet fits the screen").toBeInViewport({ ratio: 1 })
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, sheet)
    await expectAllTargets44(sheet, "390 Add expense sheet")

    const close = sheet.getByRole("button", { name: "Close", exact: true })
    await expectTapTarget(close, "Add expense ×")
    await close.click()
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
    await expectScrollLock(page, false)

    await add.click()
    await expect(sheet).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 195, y: 40 } })
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
    await expectScrollLock(page, false)
  })

  test("every desktop action is still reachable, and charts fit", async ({ page }) => {
    await fresh(page)
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toBeVisible()
    await expect(card(page, "MRR").getByRole("button", { name: "Remove MRR" })).toBeVisible()
    await expect(panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true })).toBeVisible()
    await expect(card(page, "MRR").getByRole("img").first()).toBeVisible()

    await tab(page, "New Subscribers").click()
    const sort = panel(page, "New Subscribers").getByRole("button", { name: /Sort:/ })
    await expect(sort).toBeVisible()
    await sort.click()
    const sortMenu = page.getByRole("menu")
    await expect(sortMenu).toBeVisible()
    await expectAllTargets44(sortMenu, "390 sort menu")
    await page.keyboard.press("Escape")

    await tab(page, "Expenses").click()
    await expect(panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true })).toBeVisible()
    await expect(table(page, "Expenses").getByRole("button", { name: "Remove AWS" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  test.describe(`responsive Metrics (${name} ${VIEWPORTS[name].width})`, () => {
    test.use({ viewport: VIEWPORTS[name] })

    test("keeps tables of ≤5 data columns and no page overflow", async ({ page }) => {
      await fresh(page, "/metrics?tab=new")
      const neu = table(page, "New subscribers")
      await expect(neu).toBeVisible()
      await expect(neu.getByRole("columnheader")).toHaveCount(3)
      await expect(panel(page, "New Subscribers").getByRole("list")).toHaveCount(0)

      await tab(page, "Churned Subscribers").click()
      const churned = table(page, "Churned subscribers")
      await expect(churned.getByRole("columnheader")).toHaveCount(4)

      await tab(page, "Expenses").click()
      const expenses = table(page, "Expenses")
      await expect(expenses.getByRole("columnheader")).toHaveCount(5)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
      await expectNoOverflowX(page)
    })

    test("Add expense dialog is 44px and fits the viewport", async ({ page }) => {
      await fresh(page, "/metrics?tab=expenses")
      await panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true }).click()
      const d = dialog(page, "Add expense")
      await expect(d).toBeVisible()
      await settle(d)
      await expectAllTargets44(d, `${VIEWPORTS[name].width} Add expense`)
      await expectTapTarget(d.getByRole("button", { name: "Close", exact: true }), `${VIEWPORTS[name].width} ×`)
      await expect(d, "dialog fits the screen").toBeInViewport({ ratio: 1 })
      await page.keyboard.press("Escape")
      await expect(d).toBeHidden()
    })
  })
}

/* -------------------------------------------- 44px + contrast, all widths */

for (const [size, viewport] of [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const) {
  test.describe(`responsive Metrics (${size})`, () => {
    test.use({ viewport })

    test("dialogs, pickers and chrome are 44px, and textareas do not clip", async ({ page }) => {
      await fresh(page)
      await expectAllTargets44(main(page), `${size} overview main`)
      await expect(page.locator("textarea")).toHaveCount(0)

      const add = panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true })
      await add.click()
      const picker = dialog(page, "Add a metric")
      await expect(picker).toBeVisible()
      await settle(picker)
      await expectAllTargets44(picker, `${size} Add metric`)
      await expect(picker, `${size} picker fits`).toBeInViewport({ ratio: 1 })
      await page.keyboard.press("Escape")
      await expect(picker).toBeHidden()

      await tab(page, "Expenses").click()
      await expectAllTargets44(main(page), `${size} expenses main`)
      await panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true }).click()
      const expense = dialog(page, "Add expense")
      await expect(expense).toBeVisible()
      await settle(expense)
      await expectAllTargets44(expense, `${size} Add expense`)
      await expectUnclipped(expense.getByLabel("Category"), `${size} category`)
      await page.keyboard.press("Escape")
    })

    for (const theme of ["light", "dark"] as const) {
      test(`expectReadable on restyled controls (${theme})`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        await expectReadable(header(page).getByRole("heading", { level: 1, name: "Metrics" }), `${size}/${theme} title`, expect)
        await expectReadable(persistenceNote(page), `${size}/${theme} note`, expect)
        await expectReadable(tab(page, "Overview"), `${size}/${theme} Overview tab`, expect)
        await expectReadable(card(page, "MRR").getByTestId("metric-value"), `${size}/${theme} MRR value`, expect)
        await expectReadable(
          panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true }),
          `${size}/${theme} Add metric`,
          expect
        )
      })
    }
  })
}

const TAB_NAMES = ["Overview", "New Subscribers", "Churned Subscribers", "Expenses"] as const

async function expectTabHitsAndUnderline(page: Page, size: string) {
  const list = tablist(page)
  await settle(list)
  const listBox = await list.evaluate((el) => ({
    scroll: (el as HTMLElement).scrollHeight,
    client: (el as HTMLElement).clientHeight,
  }))
  expect(listBox.scroll, `${size} tablist: no vertical scroll`).toBeLessThanOrEqual(listBox.client + 1)

  for (const name of TAB_NAMES) {
    const t = tab(page, name)
    await t.scrollIntoViewIfNeeded()
    await settle(t)
    await t.click()
    await expect(t).toHaveAttribute("aria-selected", "true")
    await settle(t)

    const box = await t.boundingBox()
    expect(box, `${size} ${name}: painted`).toBeTruthy()
    const hits = await page.evaluate(
      ({ x, top, bottom }) => {
        const at = (px: number, py: number) => {
          const el = document.elementFromPoint(px, py)
          return el?.closest("[role='tab']")?.textContent?.replace(/\s+/g, " ").trim() ?? null
        }
        return { top: at(x, top), bottom: at(x, bottom) }
      },
      { x: box!.x + box!.width / 2, top: box!.y + 2, bottom: box!.y + box!.height - 2 }
    )
    expect(hits.top, `${size} ${name}: top+2`).toBe(name)
    expect(hits.bottom, `${size} ${name}: bottom-2`).toBe(name)

    const underline = await t.evaluate((el, listEl) => {
      const after = getComputedStyle(el, "::after")
      const height = parseFloat(after.height)
      const bottom = parseFloat(after.bottom)
      const tabRect = el.getBoundingClientRect()
      const listRect = (listEl as HTMLElement).getBoundingClientRect()
      const afterBottom = tabRect.bottom - bottom
      const afterTop = afterBottom - height
      const opacity = Number(after.opacity)
      return {
        height,
        opacity,
        inside:
          afterTop >= listRect.top - 1 &&
          afterBottom <= listRect.bottom + 1 &&
          after.left !== "auto",
      }
    }, await list.elementHandle())
    expect(underline.height, `${size} ${name}: 2px underline`).toBeGreaterThanOrEqual(1.5)
    expect(underline.opacity, `${size} ${name}: underline visible`).toBeGreaterThan(0.9)
    expect(underline.inside, `${size} ${name}: underline inside tablist`).toBe(true)

    await t.focus()
    await expect(t).toBeFocused()
    expect(await t.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
    const shadow = await t.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow, `${size} ${name}: ring drawn inset`).toContain("inset")
    const clipped = await t.evaluate((el) => {
      const tabRect = el.getBoundingClientRect()
      let node = el.parentElement
      while (node) {
        const cs = getComputedStyle(node)
        const clips = (v: string) => v === "hidden" || v === "auto" || v === "scroll"
        if (clips(cs.overflowX) || clips(cs.overflowY)) {
          const r = node.getBoundingClientRect()
          if (clips(cs.overflowY) && (tabRect.top < r.top - 1 || tabRect.bottom > r.bottom + 1)) {
            return true
          }
          if (
            clips(cs.overflowX) &&
            tabRect.left >= 0 &&
            tabRect.right <= window.innerWidth &&
            (tabRect.left < r.left - 1 || tabRect.right > r.right + 1)
          ) {
            return true
          }
        }
        node = node.parentElement
      }
      return false
    })
    expect(clipped, `${size} ${name}: focus ring not clipped by overflow`).toBe(false)
  }
}

test.describe("responsive Metrics (B1 tablist)", () => {
  for (const [size, viewport] of [
    ["390", VIEWPORTS.phone],
    ["820", VIEWPORTS["tablet-portrait"]],
    ["1180", VIEWPORTS["tablet-landscape"]],
  ] as const) {
    test(`tabs are fully hittable, the underline is inside the list, and the focus ring is not clipped at ${size}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await fresh(page)
      await expectTabHitsAndUnderline(page, size)
    })
  }

  test("the tablist stays 32px at 1440", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await fresh(page)
    const box = await tablist(page).boundingBox()
    expect(box, "1440 tablist painted").toBeTruthy()
    expect(box!.height, "1440 tablist is Nova h-8").toBeGreaterThanOrEqual(31)
    expect(box!.height, "1440 tablist is Nova h-8").toBeLessThanOrEqual(33)
  })
})

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Metrics (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: 8 cards, tables, desktop-sized dialog chrome", async ({ page }) => {
    await fresh(page)
    await expect(grid(page).getByRole("article")).toHaveCount(8)
    await expect(tablist(page).getByRole("tab")).toHaveCount(4)
    await expect(panel(page, "Overview").getByRole("list")).toHaveCount(0)

    await tab(page, "New Subscribers").click()
    await expect(table(page, "New subscribers").getByRole("columnheader")).toHaveCount(3)
    await expect(panel(page, "New Subscribers").getByRole("list")).toHaveCount(0)

    await tab(page, "Expenses").click()
    await panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true }).click()
    const d = dialog(page, "Add expense")
    await expect(d).toBeVisible()
    const close = d.getByRole("button", { name: "Close", exact: true })
    const closeBox = await close.boundingBox()
    expect(closeBox, "desktop × painted").toBeTruthy()
    expect(closeBox!.height, "desktop × stays Nova-sized").toBeLessThan(44)
    const save = d.getByRole("button", { name: "Add expense", exact: true })
    const saveBox = await save.boundingBox()
    expect(saveBox!.height, "desktop submit stays Nova-sized").toBeLessThan(44)
    await page.keyboard.press("Escape")
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

})

/* ------------------------------------------------------ Mack B2–B8, r2 */

for (const [size, viewport] of [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const) {
  test.describe(`responsive Metrics B2 Recurring switch (${size})`, () => {
    test.use({ viewport })

    test("the Recurring switch stays a 32×18 pill and the label is the 44px target", async ({
      page,
    }) => {
      await fresh(page, "/metrics?tab=expenses")
      await panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true }).click()
      const sheet = dialog(page, "Add expense")
      await expect(sheet).toBeVisible()
      const sw = sheet.getByRole("switch", { name: "Recurring" })
      const box = await sw.boundingBox()
      expect(box, `${size} switch painted`).toBeTruthy()
      expect(box!.width, `${size} switch is a pill`).toBeGreaterThanOrEqual(box!.height * 1.5)
      expect(box!.width, `${size} switch ~32 wide`).toBeGreaterThanOrEqual(28)
      expect(box!.width, `${size} switch ~32 wide`).toBeLessThanOrEqual(36)
      expect(box!.height, `${size} switch ~18 tall`).toBeGreaterThanOrEqual(16)
      expect(box!.height, `${size} switch ~18 tall`).toBeLessThanOrEqual(22)

      const wrap = sw.locator("xpath=ancestor::label[1]")
      const wrapBox = await wrap.boundingBox()
      expect(wrapBox!.height, `${size} Recurring label`).toBeGreaterThanOrEqual(44)

      await expect(sw).toHaveAttribute("aria-checked", "false")
      await wrap.getByText("Recurring", { exact: true }).click()
      await expect(sw).toHaveAttribute("aria-checked", "true")
      await wrap.getByText("Recurring", { exact: true }).click()
      await expect(sw).toHaveAttribute("aria-checked", "false")
      await page.keyboard.press("Escape")
    })
  })
}

test.describe("responsive Metrics B3–B4–B5–B7 (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("subscriber cards hide the chevron and are not buttons", async ({ page }) => {
    await fresh(page, "/metrics?tab=new")
    const neu = panel(page, "New Subscribers").getByRole("list")
    await expect(neu.getByRole("listitem")).toHaveCount(8)
    await expect(neu.locator("[data-slot=row-collapse] svg.lucide-chevron-right >> visible=true")).toHaveCount(0)
    await expect(neu.getByRole("button")).toHaveCount(0)
    await expect(neu.getByRole("link")).toHaveCount(0)

    await tab(page, "Churned Subscribers").click()
    const churned = panel(page, "Churned Subscribers").getByRole("list")
    await expect(churned.getByRole("listitem")).toHaveCount(5)
    await expect(churned.locator("[data-slot=row-collapse] svg.lucide-chevron-right >> visible=true")).toHaveCount(0)
    await expect(churned.getByRole("button")).toHaveCount(0)
    await expect(churned.getByRole("link")).toHaveCount(0)
  })

  test("the churned LTV pill is labelled and reads at ≥4.5:1", async ({ page }) => {
    await fresh(page, "/metrics?tab=churned")
    const brett = panel(page, "Churned Subscribers")
      .getByRole("listitem")
      .filter({ hasText: "Brett Holloway" })
    await expect(brett.getByText("LTV")).toBeVisible()
    await expect(brett.getByText("$199")).toBeVisible()
    await expect(brett.getByText("Lifetime value")).toHaveClass(/sr-only/)
    const pill = brett.locator("span.inline-flex").filter({ hasText: "$199" })
    await expectReadable(pill, "390/light LTV pill", expect)
    await setTheme(page, "dark")
    await expectReadable(pill, "390/dark LTV pill", expect)
  })

  test("the phone Sort menu uses per-key direction words", async ({ page }) => {
    await fresh(page, "/metrics?tab=churned")
    const churned = panel(page, "Churned Subscribers")
    const sort = churned.getByRole("button", { name: /Sort:/ })
    await expect(sort).toHaveText("Sort: Churn date, newest first")

    await sort.click()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await menu.getByRole("menuitemradio", { name: /Lifetime value/ }).click()
    await expect(sort).toHaveText("Sort: Lifetime value, highest first")
    await expect(churned.getByRole("listitem").first()).toContainText("$398")

    await sort.click()
    await page.getByRole("menu").getByRole("menuitemradio", { name: /Lifetime value/ }).click()
    await expect(sort).toHaveText("Sort: Lifetime value, lowest first")
    await expect(churned.getByRole("listitem").first()).toContainText("$79")

    await tab(page, "New Subscribers").click()
    await expect(panel(page, "New Subscribers").getByRole("button", { name: /Sort:/ })).toHaveText(
      "Sort: Signup date, newest first"
    )
  })
})

for (const theme of ["light", "dark"] as const) {
  test.describe(`responsive Metrics B5 Expenses pin (390 ${theme})`, () => {
    test.use({ viewport: VIEWPORTS.phone })

    test("the Expenses pin matches the card surface and stays put", async ({ page }) => {
      await fresh(page, "/metrics?tab=expenses")
      await setTheme(page, theme)
      const expenses = table(page, "Expenses")
      await expect(expenses).toBeVisible()
      const firstTd = expenses.locator("tbody tr").first().locator("td").first()
      const scroller = expenses.locator("xpath=ancestor::*[@data-slot='responsive-table']")

      const paint = await firstTd.evaluate((td) => {
        let card: HTMLElement | null = td.parentElement
        while (
          card &&
          !/(?:^|\s)bg-surface(?:\s|$)/.test(typeof card.className === "string" ? card.className : "")
        ) {
          card = card.parentElement
        }
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
        const parse = (css: string) => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = css
          ctx.fillRect(0, 0, 1, 1)
          return [...ctx.getImageData(0, 0, 1, 1).data]
        }
        return {
          td: parse(getComputedStyle(td).backgroundColor),
          card: card ? parse(getComputedStyle(card).backgroundColor) : null,
          shadow: getComputedStyle(td).boxShadow,
        }
      })
      expect(paint.card, `${theme}: TableCard found`).toBeTruthy()
      expect(paint.td, `${theme}: first td bg equals TableCard`).toEqual(paint.card)
      expect(paint.shadow, `${theme}: pin divider`).toMatch(/inset/i)

      await scroller.evaluate((el) => {
        ;(el as HTMLElement).scrollLeft = (el as HTMLElement).scrollWidth
      })
      const pinned = await firstTd.evaluate((td) => {
        const scroller = td.closest("[data-slot='responsive-table']") as HTMLElement
        const tdRect = td.getBoundingClientRect()
        const scRect = scroller.getBoundingClientRect()
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
        ctx.fillStyle = getComputedStyle(td).backgroundColor
        ctx.fillRect(0, 0, 1, 1)
        const [, , , a] = ctx.getImageData(0, 0, 1, 1).data
        return {
          tdLeft: tdRect.left,
          scLeft: scRect.left,
          alpha: a / 255,
          scrollLeft: scroller.scrollLeft,
        }
      })
      expect(pinned.scrollLeft, `${theme}: table scrolled`).toBeGreaterThan(8)
      expect(Math.abs(pinned.tdLeft - pinned.scLeft), `${theme}: pin stays at left 0`).toBeLessThan(2)
      expect(pinned.alpha, `${theme}: pin opaque`).toBe(1)
    })
  })
}

for (const [size, viewport] of [
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const) {
  test.describe(`responsive Metrics B6 Add metric popover (${size})`, () => {
    test.use({ viewport })

    test("Add metric is a popover at tablet, not a full-width sheet", async ({ page }) => {
      await fresh(page)
      const add = panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true })
      await add.click()
      const picker = dialog(page, "Add a metric")
      await expect(picker).toBeVisible()
      await settle(picker)
      const box = await picker.boundingBox()
      expect(box, `${size} picker painted`).toBeTruthy()
      expect(box!.width, `${size} picker ≤ 512`).toBeLessThanOrEqual(512)
      await expect(picker, `${size} picker in viewport`).toBeInViewport({ ratio: 1 })
      await expect(picker.getByRole("button", { name: "Close", exact: true })).toHaveCount(0)

      const rows = picker.getByRole("button")
      expect(await rows.count(), `${size} picker rows`).toBeGreaterThan(0)
      for (const row of await rows.all()) {
        const rowBox = await row.boundingBox()
        expect(rowBox!.height, `${size} picker row`).toBeGreaterThanOrEqual(44)
        const labelBox = await row.locator("span").nth(0).boundingBox()
        const valueBox = await row.locator("span").nth(1).boundingBox()
        expect(valueBox!.x - labelBox!.x, `${size} label-to-value`).toBeLessThanOrEqual(480)
      }

      await page.keyboard.press("Escape")
      await expect(picker).toBeHidden()
      await expect(add).toBeFocused()

      await add.click()
      await expect(picker).toBeVisible()
      await main(page).getByRole("heading", { level: 1, name: "Metrics" }).click()
      await expect(picker).toBeHidden()
      await expect(add).toBeFocused()
    })
  })
}

for (const [size, viewport] of [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
  ["1440", VIEWPORTS.desktop],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`responsive Metrics B8 pressed contrast (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`chart toggle pressed vs unpressed is ≥3:1 at ${size} ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const groups = page.getByRole("group", { name: / chart type$/ })
        await expect(groups).toHaveCount(8)
        for (const group of await groups.all()) {
          const name = (await group.getAttribute("aria-label")) ?? "chart type"
          await expectPressedContrast(group, `${size}/${theme} ${name}`)
        }
      })
    })
  }
}
