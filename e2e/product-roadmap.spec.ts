import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { NOTE, countWrites, expectWritesSettled, persistenceNote, resetDemoData, writesTo } from "./support/persistence"
import { NOT_CONNECTED_COPY, ROADMAP_KEY, ROADMAP_REJECTED_KEY, freshBoard, seededBoard } from "./support/roadmap"
import { setTheme } from "./support/theme"

const STORAGE_KEY = ROADMAP_KEY
const REJECTED_KEY = ROADMAP_REJECTED_KEY

// No Notion token in e2e: the Roadmap says Not connected and starts empty
// (no sample bets, #45). The editing specs save the fixture's eight bets as
// this browser's own first (`seededBoard`, tests only).
//
// Every locator below is a role + name lookup, or is chained from one, so
// nothing else on the page can match by accident.
const main = (page: Page) => page.getByRole("main")
const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const header = (page: Page) => main(page).locator("header").first()
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true })
const cardsIn = (page: Page, name: string) => column(page, name).getByRole("article")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const notConnected = (page: Page) => main(page).getByRole("note", { name: "Notion not connected", exact: true })
const sampleNote = (page: Page) => main(page).getByRole("note", { name: "Sample data", exact: true })
const sampleTags = (page: Page) => main(page).getByTestId("sample-data-tag")
const sampleBadge = (page: Page) => header(page).getByTestId("sample-data-badge")
const emptyBoard = (page: Page) => main(page).getByRole("status", { name: "Empty board", exact: true })
const resetButton = (page: Page) => page.getByRole("button", { name: "Reset", exact: true })
const button = (scope: ReturnType<Page["getByRole"]>, name: string) =>
  scope.getByRole("button", { name, exact: true })

const titlesIn = (page: Page, name: string) =>
  cardsIn(page, name).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))

const savedCopy = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
/** The parked rejected copies, newest first: `{ at, raw, why }[]`. */
const rejectedCopies = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as { at: string; raw: string; why: string }[],
    REJECTED_KEY
  )

async function expectNoSample(page: Page) {
  await expect(sampleTags(page)).toHaveCount(0)
  await expect(sampleBadge(page)).toHaveCount(0)
  await expect(sampleNote(page)).toHaveCount(0)
}

test.describe("Product Roadmap", () => {
  test("is reachable from the sidebar; with no Notion token it says Not connected and shows no bets", async ({ page }) => {
    await page.goto("/home")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await rail(page).getByRole("link", { name: "Product Roadmap", exact: true }).click()
    await expect(page).toHaveURL(/\/product-roadmap$/)
    await expect(page.getByRole("heading", { level: 1, name: "Product Roadmap" })).toBeVisible()
    await expect(header(page)).toContainText("Signed bets, in order. Tickets live in Agent Workplace.")
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)

    await expect(notConnected(page)).toHaveText(`Not connected. ${NOT_CONNECTED_COPY}`)
    await expect(emptyBoard(page)).toContainText("No bets here yet")
    for (const name of ["Now", "Next", "Later"]) {
      await expect(column(page, name).getByRole("heading", { level: 2, name })).toBeVisible()
      await expect(column(page, name)).toContainText(`Nothing in ${name}`)
      await expect(cardsIn(page, name)).toHaveCount(0)
    }
    await expect(main(page).getByText("Flag Football 2026")).toHaveCount(0)
    await expectNoSample(page)
    await expect(button(header(page), "New bet")).toBeEnabled()
  })

  test("shows saved bets with the card anatomy, still under Not connected", async ({ page }) => {
    await seededBoard(page)
    await expect(notConnected(page)).toBeVisible()
    await expect(cardsIn(page, "Now")).toHaveCount(3)
    await expect(cardsIn(page, "Next")).toHaveCount(3)
    await expect(cardsIn(page, "Later")).toHaveCount(2)
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])
    const flag = card(page, "Flag Football 2026")
    await expect(flag.getByRole("heading", { level: 3, name: "Flag Football 2026" })).toBeVisible()
    await expect(flag).toContainText("biggest wave of new coaches")
    await expect(flag).toContainText("Rashad")
    await expect(flag).toContainText(/Q[1-4] \d{4}/)
    await expect(flag).toContainText("4 tickets")
    await expect(card(page, "Play share links")).toContainText("From Feature Request")
    await expectNoSample(page)
  })

  test("never shows the sample bets an old saved copy still holds", async ({ page }) => {
    await page.goto("/product-roadmap")
    const at = "2026-10-01T18:00:00.000Z"
    const mine = { id: "rm-9", title: "Mine", why: "", owner: "Rashad", window: "Q1 2027", column: "now", order: 0, linkedTickets: 0, signedAt: at, updatedAt: at }
    const old = { ...mine, id: "rm-1", title: "Flag Football 2026", order: 1, linkedTickets: 4, sample: true }
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify({ items: [mine, old], nextId: 10 })])
    await page.reload()
    await expect(card(page, "Mine")).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Mine"])
    await expect(main(page).getByText("Flag Football 2026")).toHaveCount(0)
    await expectNoSample(page)
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
    await expect(resetButton(page)).toBeDisabled()

    // The first real edit writes, once, and stays there.
    await button(header(page), "New bet").click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title", exact: true }).fill("First bet")
    await add.getByRole("button", { name: /^Add bet/ }).click()
    await expect(add).toBeHidden()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expectWritesSettled(page, STORAGE_KEY, 1)
    expect(await savedCopy(page)).toContain('"title":"First bet"')
    await expect(resetButton(page)).toBeEnabled()
    await expect(emptyBoard(page)).toHaveCount(0)
  })

  test("the Not connected note and the empty board clear 4.5:1 in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(notConnected(page), `${theme}/not connected`, expect)
      await expectReadable(emptyBoard(page), `${theme}/empty board`, expect)
    }
    await setTheme(page, "dark")
  })

  test("columns, enabled Reset, and pressed New-bet toggles clear 4.5:1 in both themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await seededBoard(page)
      await setTheme(page, theme)
      for (const name of ["Now", "Next", "Later"] as const) {
        await expectReadable(column(page, name), `${theme}/${name}`, expect)
      }
      await expect(resetButton(page)).toBeEnabled()
      await expectReadable(header(page), `${theme}/header with a saved copy`, expect)
      await button(header(page), "New bet").click()
      const add = dialog(page, "New bet")
      await button(add.getByRole("group", { name: "Owner", exact: true }), "Mace").click()
      await button(add.getByRole("group", { name: "Column", exact: true }), "Next").click()
      await expectReadable(add.getByRole("group", { name: "Owner", exact: true }), `${theme}/Owner pressed`, expect)
      await expectReadable(add.getByRole("group", { name: "Column", exact: true }), `${theme}/Column pressed`, expect)
      await page.keyboard.press("Escape")
      await expect(add).toBeHidden()
    }
  })

  test("keyboard: a column move and a reorder keep focus on the card", async ({ page }) => {
    await seededBoard(page)
    const staff = card(page, "Staff seats")
    await button(staff, "Move to Now").focus()
    await page.keyboard.press("Enter")
    const inNow = column(page, "Now").getByRole("article", { name: "Staff seats", exact: true })
    await expect(inNow).toBeVisible()
    expect(await inNow.evaluate((el) => el.contains(document.activeElement))).toBe(true)

    const up = button(inNow, "Move up")
    await up.focus()
    while (await up.isEnabled()) {
      await page.keyboard.press("Enter")
      expect(await inNow.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await expect(up).toBeDisabled()
    expect(await inNow.evaluate((el) => el.contains(document.activeElement))).toBe(true)

    const down = button(inNow, "Move down")
    await down.focus()
    while (await down.isEnabled()) {
      await page.keyboard.press("Enter")
      expect(await inNow.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await expect(down).toBeDisabled()
    expect(await inNow.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  })

  test("negative control: the shared probe catches sabotaged Not connected text, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectProbeCatchesSabotage(notConnected(page), `${theme}/not connected`, expect)
    }
  })

  test("adds, moves and reorders a bet; reload keeps it; Reset asks, then empties the board", async ({ page }) => {
    await seededBoard(page)

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
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    // Move it to Now (lands at the bottom), then reorder it to the top.
    await button(added, "Move to Now").click()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Practice plan templates"])
    await button(added, "Move up").click()
    await button(added, "Move up").click()
    await button(added, "Move up").click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Flag Football 2026", "Play share links", "iPad forced updates"])
    await expect(button(added, "Move up")).toBeDisabled()
    // And another card down one.
    await button(card(page, "Flag Football 2026"), "Move down").click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])

    // Reload: same sequence, same note.
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])
    expect(await titlesIn(page, "Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import"])
    await expectNoSample(page)

    // Reset asks first; keeping the edits changes nothing.
    await resetButton(page).click()
    const confirm = dialog(page, "Reset demo data?")
    await expect(confirm).toContainText("no server copy")
    await button(confirm, "Keep my edits").click()
    await expect(confirm).toBeHidden()
    await expect(card(page, "Practice plan templates")).toBeVisible()
    expect(await savedCopy(page)).not.toBeNull()

    // Reset empties the board: nothing saved, never sample bets.
    await resetDemoData(page, header(page), page)
    await expect(emptyBoard(page)).toBeVisible()
    await expect(main(page).getByRole("article")).toHaveCount(0)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
    expect(await savedCopy(page)).toBeNull()
    await expectNoSample(page)
  })

  test("edits a bet from its dialog and the edit survives reload", async ({ page }) => {
    await seededBoard(page)
    await button(card(page, "Web import from a link"), "Edit").click()
    const d = dialog(page, "Bet: Web import from a link")
    // Shared formatRelative long: a weekday-date for anything older than yesterday; full date in the title.
    await expect(d).toContainText(/Signed \w{3}, \w{3} \d{1,2} · from Feature Request/)
    await expect(d.locator("time")).toHaveAttribute("title", /^\d{1,2} \w{3} \d{4}$/)
    await expect(d.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(d.getByRole("button", { name: /^Save/ })).toBeDisabled()
    await expect(d.getByRole("textbox", { name: "Bet title", exact: true })).toHaveAttribute("maxlength", "80")

    await d.getByRole("textbox", { name: "Bet title", exact: true }).fill("Import a play from a HUDL link")
    await d.getByRole("textbox", { name: "Target window", exact: true }).fill("Dec 2026")
    await d.getByRole("button", { name: /^Save/ }).click()
    await expect(d).toBeHidden()

    const edited = column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })
    await expect(edited).toBeVisible()
    await expect(edited).toContainText("Dec 2026")

    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })).toBeVisible()
    expect((await titlesIn(page, "Next"))[0]).toBe("Import a play from a HUDL link")
    await resetDemoData(page, header(page), page)
  })

  test("Spawn ticket is a disabled, explained affordance that touches nothing", async ({ page }) => {
    await seededBoard(page)
    await countWrites(page, STORAGE_KEY)
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
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
    await seededBoard(page)
    const before = await savedCopy(page)
    await button(card(page, "Parent recap emails"), "Edit").click()
    const d = dialog(page, "Bet: Parent recap emails")
    await button(d, "Delete").click()
    await expect(button(d, "Confirm delete")).toBeVisible()
    // Nothing deleted, nothing written yet.
    expect(await savedCopy(page)).toBe(before)
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
    await resetDemoData(page, header(page), page)
    await expect(emptyBoard(page)).toBeVisible()
  })

  test("refuses a saved copy with one bad item: shows the empty board, leaves the key alone, parks it on the first save", async ({ page }) => {
    await page.goto("/product-roadmap")
    await page.evaluate((key) => localStorage.removeItem(key), REJECTED_KEY)
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
    await expect(emptyBoard(page)).toBeVisible()
    await expectNoSample(page)
    await expect(resetButton(page)).toBeDisabled()
    // load() is pure: the bad copy is still there, nothing parked yet.
    expect(await savedCopy(page)).toBe(raw)
    expect(await rejectedCopies(page)).toEqual([])
    // The first real save parks it and writes the real board.
    await button(header(page), "New bet").click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title", exact: true }).fill("After the bad copy")
    await add.getByRole("button", { name: /^Add bet/ }).click()
    await expect(add).toBeHidden()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    expect(await savedCopy(page)).not.toContain("Broken")
    const parked = await rejectedCopies(page)
    expect(parked).toHaveLength(1)
    expect(parked[0]).toMatchObject({ raw, why: "failed validation" })
    await page.evaluate((key) => localStorage.removeItem(key), REJECTED_KEY)
    await resetDemoData(page, header(page), page)
  })

  test("follows an edit made in another tab without writing back, and the writes settle", async ({ page, context }) => {
    await seededBoard(page)
    // Every page in this context counts its own writes to our key (from here on).
    await countWrites(context, STORAGE_KEY)
    await page.reload()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    const other = await context.newPage()
    await other.goto("/product-roadmap")
    await expect(persistenceNote(other)).toHaveText(NOTE.saved)
    // Counted after the other tab has visibly taken the change (web-first),
    // then must stay flat over a quiet window: a write loop never settles.
    const settled = (p: Page, n: number) => expectWritesSettled(p, STORAGE_KEY, n)

    // The other tab edits: one write there; this tab hears it and takes the copy without writing.
    await button(card(other, "Staff seats"), "Move to Now").click()
    await expect(column(page, "Now").getByRole("article", { name: "Staff seats", exact: true })).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Staff seats"])
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await settled(other, 1)
    await settled(page, 0)

    // This tab edits next: one write here, on top of the other tab's copy; the other follows, still at one.
    await button(card(page, "Staff seats"), "Move up").click()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "Staff seats", "iPad forced updates"])
    await expect(column(other, "Now").getByRole("article").nth(2)).toHaveAccessibleName("Staff seats")
    await settled(page, 1)
    await settled(other, 1)

    // Reset in the other tab clears the key; this tab empties, never-edited, Reset disabled — no write anywhere.
    await resetDemoData(other, header(other), other)
    await expect(emptyBoard(page)).toBeVisible()
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(resetButton(page)).toBeDisabled()
    await settled(page, 1)
    await settled(other, 1)
    expect(await savedCopy(page)).toBeNull()
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
    await button(header(page), "New bet").click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title", exact: true }).fill("Will not save")
    await add.getByRole("button", { name: /^Add bet/ }).click()
    await expect(add).toBeHidden()
    // The edit still shows for the session; the note tells the truth, as an alert.
    expect(await titlesIn(page, "Later")).toEqual(["Will not save"])
    await expect(persistenceNote(page, { failed: true })).toHaveText(NOTE.failed)
    await expect(persistenceNote(page)).toHaveCount(0)
    expect(await savedCopy(page)).toBeNull()
    // Nothing landed, so there is nothing to reset: the note never claims "Saved".
    await expect(resetButton(page)).toBeDisabled()
  })

  test("a per-column empty state while the board still has bets", async ({ page }) => {
    await seededBoard(page)
    await button(card(page, "Auto-scout from film"), "Move to Next").click()
    await button(card(page, "Parent recap emails"), "Move to Next").click()
    await expect(column(page, "Later")).toContainText("Nothing in Later")
    await expect(emptyBoard(page)).toHaveCount(0)
    await resetDemoData(page, header(page), page)
    await expect(emptyBoard(page)).toBeVisible()
    await expectNoSample(page)
  })
})
