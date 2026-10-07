import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesBadText, expectReadable, textNodeContrasts } from "./support/contrast"
import { NOTE, countWrites, persistenceNote, resetDemoData, writesTo } from "./support/persistence"

const STORAGE_KEY = "hotdash.product-roadmap.v1"
const REJECTED_KEY = `${STORAGE_KEY}.rejected`

// Every locator below is a role + name lookup, or is chained from one, so
// nothing else on the page can match by accident. The sample-data chips are
// the shared component's `data-testid`, always read inside a named region.
const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true })
const cardsIn = (page: Page, name: string) => column(page, name).getByRole("article")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const sampleNote = (page: Page) => main(page).getByRole("note", { name: "Sample data", exact: true })
const sampleTags = (page: Page) => main(page).getByTestId("sample-data-tag")
const sampleBadge = (page: Page) => header(page).getByTestId("sample-data-badge")
const resetButton = (page: Page) => page.getByRole("button", { name: "Reset", exact: true })
const button = (scope: ReturnType<Page["getByRole"]>, name: string) =>
  scope.getByRole("button", { name, exact: true })

const titlesIn = (page: Page, name: string) =>
  cardsIn(page, name).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))

const savedCopy = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)

async function freshBoard(page: Page) {
  await page.goto("/product-roadmap")
  await page.evaluate(
    ([a, b]) => {
      localStorage.removeItem(a)
      localStorage.removeItem(b)
    },
    [STORAGE_KEY, REJECTED_KEY]
  )
  await page.reload()
  // Hydrated, but nothing of the founder's to save yet.
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

test.describe("Product Roadmap", () => {
  test("is reachable from the sidebar and shows Now / Next / Later", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Product Roadmap", exact: true }).click()
    await expect(page).toHaveURL(/\/product-roadmap$/)
    await expect(page.getByRole("heading", { level: 1, name: "Product Roadmap" })).toBeVisible()
    await expect(header(page)).toContainText("Signed bets, in order. Tickets live in Agent Workplace.")
    await expect(persistenceNote(page)).toHaveText(/save[ds]? in this browser/)

    await expect(cardsIn(page, "Now")).toHaveCount(3)
    await expect(cardsIn(page, "Next")).toHaveCount(3)
    await expect(cardsIn(page, "Later")).toHaveCount(2)
    await expect(column(page, "Now").getByRole("heading", { level: 2, name: "Now" })).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])

    const flag = card(page, "Flag Football 2026")
    await expect(flag.getByRole("heading", { level: 3, name: "Flag Football 2026" })).toBeVisible()
    await expect(flag).toContainText("biggest wave of new coaches")
    await expect(flag).toContainText("Rashad")
    await expect(flag).toContainText(/Q[1-4] \d{4}/)
    await expect(flag).toContainText("4 tickets")
    await expect(card(page, "Play share links")).toContainText("From Feature Request")
    await expect(button(header(page), "New bet")).toBeVisible()
  })

  test("writes nothing on a clean load, and Reset is disabled until something is saved", async ({ page }) => {
    await countWrites(page, STORAGE_KEY)
    await freshBoard(page)
    expect(await savedCopy(page)).toBeNull()
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    await expect(resetButton(page)).toBeDisabled()

    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    expect(await savedCopy(page)).toBeNull()
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)

    // A no-op edit (first card can't go up) is not an edit either.
    await expect(button(card(page, "Flag Football 2026"), "Move up")).toBeDisabled()
    await expect(resetButton(page)).toBeDisabled()

    // The first real edit writes, once.
    await button(card(page, "Flag Football 2026"), "Move down").click()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    expect(await writesTo(page, STORAGE_KEY)).toBe(1)
    expect(await savedCopy(page)).toContain('"title":"Flag Football 2026"')
    await expect(resetButton(page)).toBeEnabled()
  })

  test("labels every seed card as sample data, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("8 bets tagged below are invented examples")
      await expect(sampleBadge(page)).toHaveText("Sample data")
      await expect(sampleTags(page)).toHaveCount(8)
      for (const title of ["Flag Football 2026", "Staff seats", "Parent recap emails"]) {
        const tag = card(page, title).getByTestId("sample-data-tag")
        await expect(tag).toBeVisible()
        await expect(tag).toHaveText("Sample data")
      }
    }
    await setTheme(page, "dark")
  })

  test("every text node in the sample-data surfaces clears 4.5:1 in both themes, solid, no opacity", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const notice = await expectReadable(sampleNote(page), `${theme}/notice`, expect)
      expect(notice.length).toBeGreaterThanOrEqual(2)
      await expectReadable(sampleBadge(page), `${theme}/header badge`, expect)
      const tags = await sampleTags(page).all()
      expect(tags).toHaveLength(8)
      for (const tag of tags) await expectReadable(tag, `${theme}/card tag`, expect)
      // Headroom, not a squeak: the shared palette is amber-900/100 and amber-200/950.
      for (const n of await textNodeContrasts(sampleNote(page))) {
        expect(n.ratio, `${theme} · "${n.text}"`).toBeGreaterThan(6)
      }
    }
    await setTheme(page, "dark")
  })

  test("negative control: the shared probe fails on low contrast, translucent text and opacity", async ({ page }) => {
    await freshBoard(page)
    await setTheme(page, "light")
    await expectProbeCatchesBadText(page, sampleNote(page), expect)
    // And the surface it was planted in is clean again.
    await expectReadable(sampleNote(page), "light/notice after control", expect)
    await setTheme(page, "dark")
  })

  test("adds, moves and reorders a bet; reload keeps it; Reset asks, then clears", async ({ page }) => {
    await freshBoard(page)

    // Add into Next.
    await button(header(page), "New bet").click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title", exact: true }).fill("Practice plan templates")
    await add.getByRole("textbox", { name: "Why it matters", exact: true }).fill("Reusable weekly plans a coach can tweak.")
    await add.getByRole("textbox", { name: "Target window", exact: true }).fill("Q1 2027")
    await button(add.getByRole("group", { name: "Owner", exact: true }), "Mace").click()
    await button(add.getByRole("group", { name: "Column", exact: true }), "Next").click()
    await add.getByRole("button", { name: /^Add bet/ }).click()
    await expect(add).toBeHidden()

    expect(await titlesIn(page, "Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import", "Practice plan templates"])
    const added = card(page, "Practice plan templates")
    await expect(added).toContainText("Reusable weekly plans a coach can tweak.")
    await expect(added).toContainText("Mace")
    await expect(added).toContainText("Q1 2027")
    await expect(added).toContainText("No tickets")
    await expect(added.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    // Move it to Now (lands at the bottom), then reorder it to the top.
    await button(added, "Move to Now").click()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Practice plan templates"])
    await button(added, "Move up").click()
    await button(added, "Move up").click()
    await button(added, "Move up").click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Flag Football 2026", "Play share links", "iPad forced updates"])
    await expect(button(added, "Move up")).toBeDisabled()
    // And a seed card down one.
    await button(card(page, "Flag Football 2026"), "Move down").click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])

    // Reload: same sequence, same note, no sample tag on the new one.
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])
    expect(await titlesIn(page, "Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import"])
    await expect(card(page, "Practice plan templates").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(sampleTags(page)).toHaveCount(8)

    // Reset asks first; keeping the edits changes nothing.
    await resetButton(page).click()
    const confirm = dialog(page, "Reset demo data?")
    await expect(confirm).toContainText("no server copy")
    await button(confirm, "Keep my edits").click()
    await expect(confirm).toBeHidden()
    await expect(card(page, "Practice plan templates")).toBeVisible()
    expect(await savedCopy(page)).not.toBeNull()

    await resetDemoData(page)
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])
    await expect(card(page, "Practice plan templates")).toHaveCount(0)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
    expect(await savedCopy(page)).toBeNull()
  })

  test("edits a bet from its dialog; rewriting drops the sample tag and survives reload", async ({ page }) => {
    await freshBoard(page)
    await button(card(page, "Web import from a link"), "Edit").click()
    const d = dialog(page, "Bet: Web import from a link")
    await expect(d).toContainText(/Signed \d+ days ago · \d+ \w{3} \d{4} · from Feature Request/)
    await expect(d.getByRole("button", { name: /^Save/ })).toBeDisabled()
    await expect(d.getByRole("textbox", { name: "Bet title", exact: true })).toHaveAttribute("maxlength", "80")

    await d.getByRole("textbox", { name: "Bet title", exact: true }).fill("Import a play from a HUDL link")
    await d.getByRole("textbox", { name: "Target window", exact: true }).fill("Dec 2026")
    await d.getByRole("button", { name: /^Save/ }).click()
    await expect(d).toBeHidden()

    const edited = column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })
    await expect(edited).toBeVisible()
    await expect(edited).toContainText("Dec 2026")
    await expect(edited.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(sampleNote(page)).toContainText("7 bets")

    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })).toBeVisible()
    expect((await titlesIn(page, "Next"))[0]).toBe("Import a play from a HUDL link")
    await resetDemoData(page)
  })

  test("Spawn ticket is a disabled, explained affordance that touches nothing", async ({ page }) => {
    await countWrites(page, STORAGE_KEY)
    await freshBoard(page)
    await button(card(page, "Flag Football 2026"), "Edit").click()
    const d = dialog(page, "Bet: Flag Football 2026")
    const spawn = button(d, "Spawn ticket (soon)")
    await expect(spawn).toBeDisabled()
    await expect(spawn).toHaveAttribute("title", /Will create an Agent Workplace ticket/)
    await expect(d).toContainText("4 tickets linked · sample count, display only")
    await spawn.click({ force: true })
    await expect(d).toBeVisible()
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    expect(await page.evaluate(() => localStorage.getItem("hotdash.agent-workplace.v1"))).toBeNull()
    await page.keyboard.press("Escape")
    await expect(d).toBeHidden()
  })

  test("deletes a bet after a confirm step", async ({ page }) => {
    await freshBoard(page)
    await button(card(page, "Parent recap emails"), "Edit").click()
    const d = dialog(page, "Bet: Parent recap emails")
    await button(d, "Delete").click()
    await expect(button(d, "Confirm delete")).toBeVisible()
    // Nothing deleted, nothing saved yet.
    expect(await savedCopy(page)).toBeNull()
    await button(d, "Keep it").click()
    await expect(button(d, "Delete")).toBeVisible()
    await button(d, "Delete").click()
    await button(d, "Confirm delete").click()
    await expect(d).toBeHidden()

    await expect(card(page, "Parent recap emails")).toHaveCount(0)
    expect(await titlesIn(page, "Later")).toEqual(["Auto-scout from film"])
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    expect(await savedCopy(page)).not.toContain("Parent recap emails")

    await page.reload()
    await expect(card(page, "Parent recap emails")).toHaveCount(0)
    await resetDemoData(page)
    await expect(card(page, "Parent recap emails")).toBeVisible()
  })

  test("refuses a saved copy with one bad item: parks it raw under .rejected, drops the live key, shows the seed", async ({ page }) => {
    await page.goto("/product-roadmap")
    const raw = JSON.stringify({
      nextId: 3,
      items: [
        { id: "rm-1", title: "Fine", why: "", owner: "Rashad", window: "", column: "now", order: 0, linkedTickets: 0, signedAt: "2026-10-01T18:00:00.000Z", updatedAt: "2026-10-01T18:00:00.000Z" },
        { id: "rm-2", title: "Broken", why: "", owner: "Dan", window: "", column: "now", order: 1, linkedTickets: 0, signedAt: "2026-10-01T18:00:00.000Z", updatedAt: "2026-10-01T18:00:00.000Z" },
      ],
    })
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, raw])
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(card(page, "Fine")).toHaveCount(0)
    await expect(sampleTags(page)).toHaveCount(8)
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)
    expect(await savedCopy(page)).toBeNull()
    await expect(resetButton(page)).toBeDisabled()
    // The next edit saves the real board; the parked copy is left alone.
    await button(card(page, "Flag Football 2026"), "Move down").click()
    expect(await savedCopy(page)).not.toContain("Broken")
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)
    await page.evaluate((key) => localStorage.removeItem(key), REJECTED_KEY)
    await resetDemoData(page)
  })

  test("follows an edit made in another tab without writing back, and the writes settle", async ({ page, context }) => {
    // Every page in this context counts its own writes to our key.
    await countWrites(context, STORAGE_KEY)
    await freshBoard(page)
    const other = await context.newPage()
    await other.goto("/product-roadmap")
    await expect(persistenceNote(other)).toHaveText(NOTE.unsaved)

    await button(card(other, "Staff seats"), "Move to Now").click()
    await expect(persistenceNote(other)).toHaveText(NOTE.saved)

    // No reload on the first tab: the storage event re-hydrated it.
    await expect(column(page, "Now").getByRole("article", { name: "Staff seats", exact: true })).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Staff seats"])
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    // Exactly one write, in the tab that edited; the follower wrote nothing —
    // and it stays that way (no ping-pong).
    expect(await writesTo(other, STORAGE_KEY)).toBe(1)
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)
    await page.waitForTimeout(750)
    expect(await writesTo(other, STORAGE_KEY)).toBe(1)
    expect(await writesTo(page, STORAGE_KEY)).toBe(0)

    // The follower edits next: it writes once, on top of the other tab's copy.
    await button(card(page, "Staff seats"), "Move up").click()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "Staff seats", "iPad forced updates"])
    await expect(column(other, "Now").getByRole("article").nth(2)).toHaveAccessibleName("Staff seats")
    await page.waitForTimeout(750)
    expect(await writesTo(page, STORAGE_KEY)).toBe(1)
    expect(await writesTo(other, STORAGE_KEY)).toBe(1)

    // Reset in the other tab re-seeds this one, never-edited, Reset disabled.
    await resetDemoData(other)
    await expect(column(page, "Next").getByRole("article", { name: "Staff seats", exact: true })).toBeVisible()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
    await page.waitForTimeout(500)
    expect(await writesTo(page, STORAGE_KEY)).toBe(1)
    expect(await writesTo(other, STORAGE_KEY)).toBe(1)
    await other.close()
  })

  test("says so when a save does not land", async ({ page }) => {
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException("quota", "QuotaExceededError")
        return original.call(this, k, v)
      }
    }, STORAGE_KEY)
    await freshBoard(page)
    await button(card(page, "Flag Football 2026"), "Move down").click()
    // The edit still shows for the session; the note tells the truth, as an alert.
    expect(await titlesIn(page, "Now")).toEqual(["Play share links", "Flag Football 2026", "iPad forced updates"])
    await expect(persistenceNote(page, { failed: true })).toHaveText(NOTE.failed)
    await expect(persistenceNote(page)).toHaveCount(0)
    expect(await savedCopy(page)).toBeNull()
  })

  test("shows an empty board, per-column empties, and no sample labels when every bet is gone", async ({ page }) => {
    await page.goto("/product-roadmap")
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ items: [], nextId: 1 })), STORAGE_KEY)
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(main(page).getByRole("status", { name: "Empty board", exact: true })).toContainText("No bets on the roadmap")
    for (const name of ["Now", "Next", "Later"]) {
      await expect(column(page, name)).toContainText(`Nothing in ${name}`)
      await expect(cardsIn(page, name)).toHaveCount(0)
    }
    await expect(sampleTags(page)).toHaveCount(0)
    await expect(sampleBadge(page)).toHaveCount(0)
    await expect(sampleNote(page)).toHaveCount(0)

    // One column empty while the board still has bets.
    await resetDemoData(page)
    await button(card(page, "Auto-scout from film"), "Move to Next").click()
    await button(card(page, "Parent recap emails"), "Move to Next").click()
    await expect(column(page, "Later")).toContainText("Nothing in Later")
    await expect(main(page).getByRole("status", { name: "Empty board", exact: true })).toHaveCount(0)
    await resetDemoData(page)
    await expect(sampleTags(page)).toHaveCount(8)
  })
})
