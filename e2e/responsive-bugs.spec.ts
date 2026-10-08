import { expect, test, type Locator, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { expectNoOverflowX, pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Bugs at phone / tablet / desktop (Deke 12:1465, 12:1717, 12:1952, 12:2368,
 * 7:47). Phone stacks each bug as a card link (tag + age, title, meta,
 * chevron); tablet keeps the desktop row; desktop (≥1280) is unchanged. A
 * card still opens the Workplace's TicketView via `?issue=`.
 */

/** Bugs has no key of its own: it reads and writes the Workplace's. */
const STORAGE_KEY = "hotdash.agent-workplace.v2"

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const main = (page: Page) => page.getByRole("main")
const pageHeader = (page: Page) => page.locator("main header").first()
const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const bug = (page: Page, key: string) => list(page).getByRole("link", { name: new RegExp(`\\b${key}\\b`) })
const crashCard = (page: Page) => page.getByRole("article", { name: "Crashes", exact: true })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })
const emptyStatus = (page: Page) => list(page).getByRole("status", { name: "Empty bug list" })
const TITLE_419 = "Crash opening a shared playbook on iPad"

async function fresh(page: Page) {
  await page.goto("/bugs")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

/**
 * No open bugs: every open one moved to Done through the ticket, as
 * e2e/bugs.spec.ts does. Done at desktop width (the ticket view's own
 * responsive work is a separate PR), then back to `viewport`.
 */
async function emptyBugs(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(VIEWPORTS.desktop)
  await fresh(page)
  for (const [key, from] of [
    ["CHLK-419", "To Do"],
    ["CHLK-404", "In Progress"],
    ["CHLK-420", "In Review"],
  ] as const) {
    await page.goto(`/bugs?issue=${key}`)
    await props(page).getByRole("button", { name: from, exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(props(page).getByRole("button", { name: "Done", exact: true })).toBeVisible()
  }
  await page.setViewportSize(viewport)
  await page.goto("/bugs")
  await waitForHydration(page)
  await expect(emptyStatus(page)).toHaveText("No open bugs")
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
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

async function box(locator: Locator) {
  await expect(locator).toBeVisible()
  const b = await locator.boundingBox()
  expect(b).toBeTruthy()
  return b!
}

/** Phone card: tag above title, age top-right on the tag's line, chevron right. */
async function expectStackedCard(page: Page, key: string, title: string) {
  const card = bug(page, key)
  await expect(card).toHaveAttribute("href", `/bugs?issue=${key}`)
  const c = await box(card)
  const tag = await box(card.getByTestId("bug-tag"))
  const age = await box(card.getByTestId("bug-age"))
  const head = await box(card.getByText(title, { exact: true }))
  const chevron = await box(card.getByTestId("bug-chevron"))

  expect(tag.y + tag.height, `${key}: tag above title`).toBeLessThanOrEqual(head.y + 1)
  expect(age.y + age.height, `${key}: age above title`).toBeLessThanOrEqual(head.y + 1)
  expect(age.x, `${key}: age right of tag`).toBeGreaterThan(tag.x + tag.width)
  expect(c.x + c.width - (age.x + age.width), `${key}: age hugs the right edge`).toBeLessThanOrEqual(24)
  expect(Math.abs(head.x - tag.x), `${key}: title under tag`).toBeLessThanOrEqual(1)
  expect(chevron.x, `${key}: chevron right of title`).toBeGreaterThanOrEqual(head.x + head.width)
  expect(chevron.y, `${key}: chevron below the tag line`).toBeGreaterThanOrEqual(tag.y)
}

/** Tablet/desktop row: tag left of the title on one line, age right, no chevron. */
async function expectDesktopRow(page: Page, key: string, title: string) {
  const card = bug(page, key)
  await expect(card.getByTestId("bug-chevron")).toBeHidden()
  const tag = await box(card.getByTestId("bug-tag"))
  const age = await box(card.getByTestId("bug-age"))
  const head = await box(card.getByText(title, { exact: true }))
  expect(tag.x + tag.width, `${key}: tag left of title`).toBeLessThanOrEqual(head.x)
  expect(tag.y, `${key}: tag on the title line`).toBeLessThan(head.y + head.height)
  expect(age.x, `${key}: age right of title`).toBeGreaterThanOrEqual(head.x + head.width)
  expect(Math.abs(age.y - head.y), `${key}: age on the title line`).toBeLessThanOrEqual(6)
}

async function expectNoOverflow(page: Page) {
  expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  await expectNoOverflowX(page)
}

/* ------------------------------------------------------------------ phone */

test.describe("responsive Bugs (phone 390)", () => {
  test.use({ viewport: VIEWPORTS.phone })

  test("stacks each bug as a card link and does not scroll sideways", async ({ page }) => {
    await fresh(page)
    await expect(list(page).getByRole("link")).toHaveCount(4)
    await expectStackedCard(page, "CHLK-419", TITLE_419)
    await expectStackedCard(page, "CHLK-404", "Undo stack for iPad canvas")
    await expect(bug(page, "CHLK-419")).toContainText("CHLK-419")
    await expect(bug(page, "CHLK-419")).toContainText("Urgent")
    await expect(bug(page, "CHLK-419")).toContainText("Yo-Yo")
    await expect(bug(page, "CHLK-419").getByTestId("bug-age")).toHaveText("5h ago")

    // Header stacks: title + lede, then the note, then the badge.
    const lede = await box(pageHeader(page).getByText("Yo-Yo's page. Coach-reported and crashes."))
    const note = await box(persistenceNote(page))
    const badge = await box(pageHeader(page).getByText("Dummy / design mock"))
    expect(note.y).toBeGreaterThanOrEqual(lede.y + lede.height)
    expect(badge.y).toBeGreaterThanOrEqual(note.y + note.height)

    // Crash card full width.
    const crash = await box(crashCard(page))
    const listBox = await box(list(page))
    expect(Math.abs(crash.width - listBox.width)).toBeLessThanOrEqual(1)

    await expectNoOverflow(page)
    await expectAllTargets44(main(page), "390 list")
  })

  test("a card opens the ticket and Back to Bugs returns to the list", async ({ page }) => {
    await fresh(page)
    await bug(page, "CHLK-419").click()
    await expect(page).toHaveURL(/\/bugs\?issue=CHLK-419$/)
    await expect(page.getByRole("heading", { level: 1, name: TITLE_419 })).toBeVisible()
    // The Bugs page chrome around the ticket stays inside the viewport.
    await expect(pageHeader(page).getByRole("heading", { level: 1, name: "Bugs" })).toBeVisible()
    const header = await box(pageHeader(page))
    expect(header.x + header.width).toBeLessThanOrEqual(VIEWPORTS.phone.width + 1)
    await expectNoOverflowX(page)

    await page.getByRole("button", { name: "Back to Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expectStackedCard(page, "CHLK-419", TITLE_419)
  })

  test("B1: a lower card opens its ticket at the top, and Back returns to the same scroll spot without a new history entry", async ({ page }) => {
    await fresh(page)
    const card = bug(page, "CHLK-421")
    const back = page.getByRole("button", { name: "Back to Bugs", exact: true })
    const scrollY = () => page.evaluate(() => window.scrollY)
    const historyLength = () => page.evaluate(() => history.length)

    // Scroll to the bottom of the list, where CHLK-421 sits.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(scrollY).toBeGreaterThan(100)
    const listY = await scrollY()
    const cardTop = (await box(card)).y
    const before = await historyLength()

    for (const round of [1, 2]) {
      await card.click()
      await expect(page).toHaveURL(/\/bugs\?issue=CHLK-421$/)
      await expect(page.getByRole("heading", { level: 1, name: "Crash exporting a book to PDF" })).toBeVisible()
      // Back is in view, below the sticky top bar, not hidden under it.
      await expect.poll(scrollY, `round ${round}: ticket starts at its top`).toBe(0)
      const bar = await box(page.locator("[data-slot='app-header']"))
      const backBox = await box(back)
      expect(backBox.y, `round ${round}: Back below the top bar`).toBeGreaterThanOrEqual(bar.y + bar.height)
      expect(backBox.y + backBox.height, `round ${round}: Back above the fold`).toBeLessThanOrEqual(VIEWPORTS.phone.height)

      await back.click()
      await expect(page).toHaveURL(/\/bugs$/)
      await expect.poll(scrollY, `round ${round}: list scroll restored`).toBeGreaterThanOrEqual(listY - 2)
      expect(Math.abs((await scrollY()) - listY), `round ${round}: scrollY ±2`).toBeLessThanOrEqual(2)
      expect(Math.abs((await box(card)).y - cardTop), `round ${round}: CHLK-421 top ±2`).toBeLessThanOrEqual(2)
      // Back is a history step: only the open added an entry, and each
      // round trip reuses it.
      expect(await historyLength(), `round ${round}: no entry from Back`).toBe(before + 1)
    }
  })

  test("B1: a deep-linked ticket's Back goes to the Bugs list", async ({ page }) => {
    await fresh(page)
    await page.goto("/bugs?issue=CHLK-419")
    await waitForHydration(page)
    await expect(page.getByRole("heading", { level: 1, name: TITLE_419 })).toBeVisible()
    await page.getByRole("button", { name: "Back to Bugs", exact: true }).click()
    await expect(page).toHaveURL(/\/bugs$/)
    await expectStackedCard(page, "CHLK-419", TITLE_419)
  })

  test("B2: card links announce title, status and key; the assignee is said once", async ({ page }) => {
    await fresh(page)
    for (const [key, title, status] of [
      ["CHLK-419", TITLE_419, "To Do"],
      ["CHLK-421", "Crash exporting a book to PDF", "Done"],
    ] as const) {
      const card = list(page).getByRole("link", { name: new RegExp(`${title}\\s*, status ${status}\\s*${key}(?!\\d)`) })
      await expect(card, key).toHaveCount(1)
      await expect(card).toHaveAttribute("href", `/bugs?issue=${key}`)
    }
    // F6: the avatar no longer repeats the name ("YY Yo-Yo Yo-Yo").
    const snapshot = await list(page).ariaSnapshot()
    expect(snapshot).not.toMatch(/Yo-Yo\s+Yo-Yo/)
    expect(snapshot).not.toMatch(/YY\s+Yo-Yo/)
    expect(snapshot).toMatch(/Grok-1 \(agent\)/)
  })

  test("empty state: no overflow, every control 44×44", async ({ page }) => {
    await emptyBugs(page, VIEWPORTS.phone)
    await expect(list(page).getByText("0 open · 4 fixed")).toBeVisible()
    await expectStackedCard(page, "CHLK-419", TITLE_419)
    await expectNoOverflow(page)
    await expectAllTargets44(main(page), "390 empty")
  })
})

/* ----------------------------------------------------------------- tablet */

for (const name of ["tablet-portrait", "tablet-landscape"] as const) {
  const viewport = VIEWPORTS[name]
  test.describe(`responsive Bugs (${name} ${viewport.width})`, () => {
    test.use({ viewport })

    test("keeps the desktop row layout, opens the ticket, every control 44×44", async ({ page }) => {
      await fresh(page)
      await expectDesktopRow(page, "CHLK-419", TITLE_419)
      await expectDesktopRow(page, "CHLK-420", "Route arrows vanish after undo")
      expect(Math.round((await box(crashCard(page))).width)).toBe(320)
      await expectNoOverflow(page)
      await expectAllTargets44(main(page), `${viewport.width} list`)

      await bug(page, "CHLK-419").click()
      await expect(page).toHaveURL(/\/bugs\?issue=CHLK-419$/)
      await expect(page.getByRole("heading", { level: 1, name: TITLE_419 })).toBeVisible()
      await expectNoOverflowX(page)
      await page.getByRole("button", { name: "Back to Bugs", exact: true }).click()
      await expect(page).toHaveURL(/\/bugs$/)
      await expect(bug(page, "CHLK-419")).toBeVisible()
    })

    test("empty state: no overflow, every control 44×44", async ({ page }) => {
      await emptyBugs(page, viewport)
      await expectNoOverflow(page)
      await expectAllTargets44(main(page), `${viewport.width} empty`)
    })
  })
}

/* ---------------------------------------------------------------- desktop */

test.describe("responsive Bugs (desktop 1440)", () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test("is unchanged: desktop rows, no chevrons, crash card max-w-xs, header on one line", async ({ page }) => {
    await fresh(page)
    await expectDesktopRow(page, "CHLK-419", TITLE_419)
    await expect(list(page).getByTestId("bug-chevron").first()).toBeHidden()
    expect(Math.round((await box(crashCard(page))).width)).toBe(320)
    const title = await box(pageHeader(page).getByRole("heading", { level: 1, name: "Bugs" }))
    const badge = await box(pageHeader(page).getByText("Dummy / design mock"))
    expect(badge.x).toBeGreaterThan(title.x + title.width)
    expect(badge.y).toBeLessThan(title.y + title.height)
    // Reset keeps its desktop size: the 44px override stops below xl.
    const reset = await box(pageHeader(page).getByRole("button", { name: "Reset", exact: true }))
    expect(reset.height).toBeLessThan(44)
    await expectNoOverflow(page)
  })

  test("empty state has no overflow", async ({ page }) => {
    await emptyBugs(page, VIEWPORTS.desktop)
    await expectNoOverflow(page)
  })
})


/**
 * Non-text contrast (WCAG 1.4.11) of an icon: its `currentColor` against
 * the composited background behind it. Colours go through a 1×1 canvas so
 * oklch() and alpha resolve the way the browser paints them.
 */
async function iconContrast(locator: Locator) {
  return locator.evaluate((el) => {
    const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", {
      willReadFrequently: true,
    })!
    const rgba = (colour: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = colour
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    const layers: number[][] = []
    for (let n = el.parentElement; n; n = n.parentElement) {
      const bg = rgba(getComputedStyle(n).backgroundColor)
      if (bg[3] > 0) layers.push(bg)
      if (bg[3] === 1) break
    }
    let bg = [255, 255, 255]
    for (const l of layers.reverse()) bg = bg.map((v, i) => v * (1 - l[3]) + l[i] * l[3])
    const f = rgba(getComputedStyle(el).color)
    const fg = bg.map((v, i) => v * (1 - f[3]) + f[i] * f[3])
    const lum = (p: number[]) => {
      const [r, g, b] = p.map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [a, b] = [lum(fg), lum(bg)]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

/**
 * The route's error boundary. The store validates every saved copy, so
 * nothing real reaches it; the test breaks `Date.parse` after hydration
 * and opens a ticket, so a render inside the /bugs segment throws.
 */
async function forceErrorState(page: Page) {
  await expect(bug(page, "CHLK-419")).toBeVisible()
  // Patch and click in one task so no clock tick re-renders (and throws) first.
  await page.evaluate(() => {
    Date.parse = () => {
      throw new Error("e2e: forced Bugs render error")
    }
    document.querySelector<HTMLAnchorElement>("a[href*='issue=CHLK-419']")!.click()
  })
  const alert = page
    .getByRole("heading", { name: "Bugs couldn’t render" })
    .locator("xpath=ancestor::*[@role='alert'][1]")
  await expect(alert).toBeVisible()
  return alert
}

/* --------------------------------------------------------------- readable */

const READABLE = [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
  ["1180", VIEWPORTS["tablet-landscape"]],
] as const

async function expectBugsReadable(page: Page, label: string) {
  // The header minus the shared note's *disabled* Reset (opacity 0.5 by
  // design; WCAG 1.4.3 exempts inactive controls).
  const header = pageHeader(page)
  await expectReadable(header.getByRole("heading", { level: 1 }), `${label}/title`, expect)
  await expectReadable(header.locator("p").first(), `${label}/subtitle`, expect)
  await expectReadable(persistenceNote(page), `${label}/note`, expect)
  await expectReadable(header.getByText("Dummy / design mock"), `${label}/badge`, expect)
  await expectReadable(crashCard(page), `${label}/crash card`, expect)
  await expectReadable(list(page), `${label}/list`, expect)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of READABLE) {
    test.describe(`readable Bugs (${size} ${theme})`, () => {
      test.use({ viewport })

      test(`list text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        await expectBugsReadable(page, `${theme}/${size}/list`)
      })

      test(`empty text clears 4.5:1 in ${theme}`, async ({ page }) => {
        await emptyBugs(page, viewport)
        await setTheme(page, theme)
        await expectBugsReadable(page, `${theme}/${size}/empty`)
      })

      test(`error state: readable and every action 44×44 in ${theme}`, async ({ page }) => {
        await fresh(page)
        await setTheme(page, theme)
        const alert = await forceErrorState(page)
        await expectReadable(alert, `${theme}/${size}/error`, expect)
        await expectAllTargets44(alert, `${theme}/${size}/error`)
        expect(await iconContrast(alert.locator("svg").first()), "error icon ≥ 3:1").toBeGreaterThanOrEqual(3)
        await expectNoOverflowX(page)
      })

      if (size === "390") {
        test(`phone card chevron clears 3:1 in ${theme}`, async ({ page }) => {
          await fresh(page)
          await setTheme(page, theme)
          const chevrons = list(page).getByTestId("bug-chevron")
          await expect(chevrons.first()).toBeVisible()
          for (const chevron of await chevrons.all()) {
            expect(await iconContrast(chevron), "chevron ≥ 3:1").toBeGreaterThanOrEqual(3)
          }
        })
      }
    })
  }
}

/* ------------------------------------------------------------- focus ring */

/**
 * Differing pixels in the `width`-px column just inside a card's left edge,
 * focused vs unfocused. The ul clips anything drawn outside the card, so an
 * outer ring shows nothing here; only a ring drawn inside the card does.
 */
async function leftEdgeDiff(page: Page, unfocused: Buffer, focused: Buffer, width = 3) {
  return page.evaluate(
    async ({ a, b, width }) => {
      const load = async (src: string) => {
        const img = new Image()
        img.src = `data:image/png;base64,${src}`
        await img.decode()
        return img
      }
      const [ia, ib] = await Promise.all([load(a), load(b)])
      const pixels = (img: HTMLImageElement) => {
        const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height })
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, width, img.height).data
      }
      const [pa, pb] = [pixels(ia), pixels(ib)]
      // Rows away from the rounded corners of the first/last card.
      const rows = Math.min(ia.height, ib.height)
      let changedRows = 0
      let checkedRows = 0
      for (let y = 8; y < rows - 8; y++) {
        checkedRows++
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(pa[i + c] - pb[i + c])))
          if (delta > 8) {
            changedRows++
            break
          }
        }
      }
      return { changedRows, checkedRows, sameSize: ia.width === ib.width && ia.height === ib.height }
    },
    { a: unfocused.toString("base64"), b: focused.toString("base64"), width }
  )
}

for (const [size, viewport] of [
  ["390", VIEWPORTS.phone],
  ["820", VIEWPORTS["tablet-portrait"]],
] as const) {
  test.describe(`focus ring Bugs (${size})`, () => {
    test.use({ viewport })

    test(`B3: a Tab-focused card shows its ring inside the card at ${size}`, async ({ page }) => {
      await fresh(page)
      const prev = bug(page, "CHLK-419")
      const card = bug(page, "CHLK-404")
      await card.scrollIntoViewIfNeeded()
      // Pointer off the list so no hover fill muddies the comparison.
      await page.mouse.move(viewport.width - 1, viewport.height - 1)
      const unfocused = await card.screenshot({ animations: "disabled" })

      // Keyboard path: from the card above, Tab once.
      await prev.focus()
      await page.keyboard.press("Tab")
      await expect(card).toBeFocused()
      expect(await card.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
      const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow)
      expect(shadow, "ring drawn inset").toContain("inset")

      const focused = await card.screenshot({ animations: "disabled" })
      const diff = await leftEdgeDiff(page, unfocused, focused)
      expect(diff.sameSize).toBe(true)
      expect(diff.checkedRows).toBeGreaterThan(20)
      // Every row of the left 3px column changes when the ring shows.
      expect(diff.changedRows, `${size}: ring visible just inside the left edge`).toBe(diff.checkedRows)
    })
  })
}
