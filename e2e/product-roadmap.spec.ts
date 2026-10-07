import { expect, test, type Page } from "@playwright/test"

import { contrastFailures, measureSampleDataText } from "./support/roadmap-contrast"

const STORAGE_KEY = "hotdash.product-roadmap.v1"
const REJECTED_KEY = `${STORAGE_KEY}.rejected`

// Every role lookup below is scoped by name, directly or through a named
// ancestor, so nothing else on the page can ever match by accident.
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true })
const cardsIn = (page: Page, name: string) => column(page, name).getByRole("article")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const sampleNote = (page: Page) => page.getByRole("note", { name: "Sample data" })
const persistence = (page: Page) => page.getByTestId("persistence-note")
const resetButton = (page: Page) => page.getByRole("button", { name: "Reset", exact: true })

const titlesIn = (page: Page, name: string) =>
  cardsIn(page, name).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))

const savedCopy = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)

/** Counts writes to our key from before the page's own scripts run. */
async function spyOnWrites(page: Page) {
  await page.addInitScript((key) => {
    const writes: string[] = []
    ;(window as unknown as { __roadmapWrites: string[] }).__roadmapWrites = writes
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) writes.push(v)
      return original.call(this, k, v)
    }
  }, STORAGE_KEY)
}
const writes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __roadmapWrites: string[] }).__roadmapWrites)

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
  await expect(persistence(page)).toHaveText("Edits save in this browser")
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

async function reset(page: Page) {
  await resetButton(page).click()
  await dialog(page, "Reset the roadmap?").getByRole("button", { name: "Confirm reset", exact: true }).click()
  await expect(dialog(page, "Reset the roadmap?")).toBeHidden()
}

test.describe("Product Roadmap", () => {
  test("is reachable from the sidebar and shows Now / Next / Later", async ({ page }) => {
    await page.goto("/home")
    await page.getByRole("link", { name: "Product Roadmap", exact: true }).click()
    await expect(page).toHaveURL(/\/product-roadmap$/)
    await expect(page.getByRole("heading", { level: 1, name: "Product Roadmap" })).toBeVisible()
    await expect(page.getByText("Signed bets, in order. Tickets live in Agent Workplace.")).toBeVisible()
    await expect(persistence(page)).toHaveText(/save[ds]? in this browser/)

    await expect(cardsIn(page, "Now")).toHaveCount(3)
    await expect(cardsIn(page, "Next")).toHaveCount(3)
    await expect(cardsIn(page, "Later")).toHaveCount(2)
    await expect(column(page, "Now").getByRole("heading", { level: 2, name: "Now" })).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])

    const flag = card(page, "Flag Football 2026")
    await expect(flag).toContainText("biggest wave of new coaches")
    await expect(flag).toContainText("Rashad")
    await expect(flag).toContainText(/Q[1-4] \d{4}/)
    await expect(flag).toContainText("4 tickets")
    await expect(card(page, "Play share links")).toContainText("From Feature Request")
    await expect(page.getByRole("button", { name: "New bet", exact: true })).toBeVisible()
  })

  test("writes nothing on a clean load, and Reset is disabled until something is saved", async ({ page }) => {
    await spyOnWrites(page)
    await freshBoard(page)
    expect(await savedCopy(page)).toBeNull()
    expect(await writes(page)).toEqual([])
    await expect(resetButton(page)).toBeDisabled()

    await page.reload()
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    expect(await savedCopy(page)).toBeNull()
    expect(await writes(page)).toEqual([])

    // A no-op edit (first card can't go up) is not an edit either.
    await expect(card(page, "Flag Football 2026").getByRole("button", { name: "Move up", exact: true })).toBeDisabled()
    await expect(resetButton(page)).toBeDisabled()

    // The first real edit writes, once.
    await card(page, "Flag Football 2026").getByRole("button", { name: "Move down", exact: true }).click()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    expect(await writes(page)).toHaveLength(1)
    expect(await savedCopy(page)).toContain('"title":"Flag Football 2026"')
    await expect(resetButton(page)).toBeEnabled()
  })

  test("labels every seed card as sample data, in both themes", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expect(sampleNote(page)).toBeVisible()
      await expect(sampleNote(page)).toContainText("8 bets tagged below are invented examples")
      await expect(page.getByTestId("sample-data-badge")).toHaveText("Sample data")
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(8)
      for (const title of ["Flag Football 2026", "Staff seats", "Parent recap emails"]) {
        const tag = card(page, title).getByTestId("sample-data-tag")
        await expect(tag).toBeVisible()
        await expect(tag).toHaveText("Sample data")
      }
    }
    await setTheme(page, "dark")
  })

  test("every text node in the sample-data surfaces clears 4.5:1 in both themes, with no opacity", async ({ page }) => {
    await freshBoard(page)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const nodes = await measureSampleDataText(page)
      // 8 tags + the badge + the notice's text nodes.
      expect(nodes.filter((n) => n.label === "sample-data-tag")).toHaveLength(8)
      expect(nodes.filter((n) => n.label === "sample-data-badge")).toHaveLength(1)
      expect(nodes.filter((n) => n.label === "sample-data-notice").length).toBeGreaterThanOrEqual(2)
      expect(contrastFailures(nodes), theme).toEqual([])
      // Headroom, not a squeak: the palette is amber-800/100 and amber-200/950.
      for (const n of nodes) expect(n.ratio, `${theme} · ${n.label} · "${n.text}"`).toBeGreaterThan(6)
    }
    await setTheme(page, "dark")
  })

  test("negative control: the probe fails on low contrast, translucent text and opacity", async ({ page }) => {
    await freshBoard(page)
    await setTheme(page, "light")
    const before = contrastFailures(await measureSampleDataText(page))
    expect(before).toEqual([])

    // Plant three bad "sample-data" tags in the board and make sure the probe
    // catches each one, then take them out again.
    await page.evaluate(() => {
      const host = document.querySelector('[role="note"][aria-label="Sample data"]')!.parentElement!
      const mk = (id: string, style: string, text: string) => {
        const el = document.createElement("span")
        el.setAttribute("data-testid", "sample-data-tag")
        el.id = id
        el.setAttribute("style", style)
        el.textContent = text
        host.append(el)
      }
      mk("probe-low", "color:#9a9a9a;background:#ffffff", "Low contrast")
      mk("probe-alpha", "color:rgba(0,0,0,0.4);background:#ffffff", "Alpha text")
      mk("probe-opacity", "color:#000;background:#fff;opacity:0.5", "Half opacity")
    })
    const nodes = await measureSampleDataText(page)
    const failures = contrastFailures(nodes)
    expect(failures.some((f) => f.includes('"Low contrast"') && /contrast 2\.\d\d:1 < 4\.5:1/.test(f))).toBe(true)
    expect(failures.some((f) => f.includes('"Alpha text"') && f.includes("text alpha"))).toBe(true)
    expect(failures.some((f) => f.includes('"Half opacity"') && f.includes("opacity 0.5"))).toBe(true)
    expect(failures).toHaveLength(3)

    await page.evaluate(() => {
      for (const id of ["probe-low", "probe-alpha", "probe-opacity"]) document.getElementById(id)?.remove()
    })
    expect(contrastFailures(await measureSampleDataText(page))).toEqual([])
    await setTheme(page, "dark")
  })

  test("adds, moves and reorders a bet; reload keeps it; Reset asks, then clears", async ({ page }) => {
    await freshBoard(page)

    // Add into Next.
    await page.getByRole("button", { name: "New bet", exact: true }).click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title" }).fill("Practice plan templates")
    await add.getByRole("textbox", { name: "Why it matters" }).fill("Reusable weekly plans a coach can tweak.")
    await add.getByRole("textbox", { name: "Target window" }).fill("Q1 2027")
    await add.getByRole("group", { name: "Owner" }).getByRole("button", { name: "Mace", exact: true }).click()
    await add.getByRole("group", { name: "Column" }).getByRole("button", { name: "Next", exact: true }).click()
    await add.getByRole("button", { name: /Add bet/ }).click()
    await expect(add).toBeHidden()

    expect(await titlesIn(page, "Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import", "Practice plan templates"])
    const added = card(page, "Practice plan templates")
    await expect(added).toContainText("Reusable weekly plans a coach can tweak.")
    await expect(added).toContainText("Mace")
    await expect(added).toContainText("Q1 2027")
    await expect(added).toContainText("No tickets")
    await expect(added.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(persistence(page)).toHaveText("Saved in this browser")

    // Move it to Now (lands at the bottom), then reorder it to the top.
    await added.getByRole("button", { name: "Move to Now", exact: true }).click()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Practice plan templates"])
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Flag Football 2026", "Play share links", "iPad forced updates"])
    await expect(added.getByRole("button", { name: "Move up", exact: true })).toBeDisabled()
    // And a seed card down one.
    await card(page, "Flag Football 2026").getByRole("button", { name: "Move down", exact: true }).click()
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])

    // Reload: same sequence, same note, no sample tag on the new one.
    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    expect(await titlesIn(page, "Now")).toEqual(["Practice plan templates", "Play share links", "Flag Football 2026", "iPad forced updates"])
    expect(await titlesIn(page, "Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import"])
    await expect(card(page, "Practice plan templates").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(8)

    // Reset asks first; keeping the edits changes nothing.
    await resetButton(page).click()
    const confirm = dialog(page, "Reset the roadmap?")
    await expect(confirm).toContainText("There is no undo")
    await confirm.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(card(page, "Practice plan templates")).toBeVisible()
    expect(await savedCopy(page)).not.toBeNull()

    await reset(page)
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])
    await expect(card(page, "Practice plan templates")).toHaveCount(0)
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    await expect(resetButton(page)).toBeDisabled()
    expect(await savedCopy(page)).toBeNull()
  })

  test("edits a bet from its dialog; rewriting drops the sample tag and survives reload", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Web import from a link").getByRole("button", { name: "Edit", exact: true }).click()
    const d = dialog(page, "Bet: Web import from a link")
    await expect(d).toContainText(/Signed \d+ days ago · \d+ \w{3} \d{4} · from Feature Request/)
    await expect(d.getByRole("button", { name: /Save/ })).toBeDisabled()
    await expect(d.getByRole("textbox", { name: "Bet title" })).toHaveAttribute("maxlength", "80")

    await d.getByRole("textbox", { name: "Bet title" }).fill("Import a play from a HUDL link")
    await d.getByRole("textbox", { name: "Target window" }).fill("Dec 2026")
    await d.getByRole("button", { name: /Save/ }).click()
    await expect(d).toBeHidden()

    const edited = column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })
    await expect(edited).toBeVisible()
    await expect(edited).toContainText("Dec 2026")
    await expect(edited.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(sampleNote(page)).toContainText("7 bets")

    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })).toBeVisible()
    expect((await titlesIn(page, "Next"))[0]).toBe("Import a play from a HUDL link")
    await reset(page)
  })

  test("Spawn ticket is a disabled, explained affordance that touches nothing", async ({ page }) => {
    await spyOnWrites(page)
    await freshBoard(page)
    await card(page, "Flag Football 2026").getByRole("button", { name: "Edit", exact: true }).click()
    const d = dialog(page, "Bet: Flag Football 2026")
    const spawn = d.getByRole("button", { name: "Spawn ticket (soon)", exact: true })
    await expect(spawn).toBeDisabled()
    await expect(spawn).toHaveAttribute("title", /Will create an Agent Workplace ticket/)
    await expect(d).toContainText("4 tickets linked · sample count, display only")
    await spawn.click({ force: true })
    await expect(d).toBeVisible()
    expect(await writes(page)).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem("hotdash.agent-workplace.v1"))).toBeNull()
    await page.keyboard.press("Escape")
  })

  test("deletes a bet after a confirm step", async ({ page }) => {
    await freshBoard(page)
    await card(page, "Parent recap emails").getByRole("button", { name: "Edit", exact: true }).click()
    const d = dialog(page, "Bet: Parent recap emails")
    await d.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(d.getByRole("button", { name: "Confirm delete", exact: true })).toBeVisible()
    // Nothing deleted, nothing saved yet.
    expect(await savedCopy(page)).toBeNull()
    await d.getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(d.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
    await d.getByRole("button", { name: "Delete", exact: true }).click()
    await d.getByRole("button", { name: "Confirm delete", exact: true }).click()
    await expect(d).toBeHidden()

    await expect(card(page, "Parent recap emails")).toHaveCount(0)
    expect(await titlesIn(page, "Later")).toEqual(["Auto-scout from film"])
    await expect(persistence(page)).toHaveText("Saved in this browser")
    expect(await savedCopy(page)).not.toContain("Parent recap emails")

    await page.reload()
    await expect(card(page, "Parent recap emails")).toHaveCount(0)
    await reset(page)
    await expect(card(page, "Parent recap emails")).toBeVisible()
  })

  test("refuses a saved copy with one bad item, keeps it raw under .rejected, shows the seed", async ({ page }) => {
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
    await expect(persistence(page)).toHaveText("Edits save in this browser")
    await expect(card(page, "Fine")).toHaveCount(0)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(8)
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)
    // The bad copy is left alone until the next edit overwrites it.
    expect(await savedCopy(page)).toBe(raw)
    await card(page, "Flag Football 2026").getByRole("button", { name: "Move down", exact: true }).click()
    expect(await savedCopy(page)).not.toContain("Broken")
    expect(await page.evaluate((key) => localStorage.getItem(key), REJECTED_KEY)).toBe(raw)
    await page.evaluate((key) => localStorage.removeItem(key), REJECTED_KEY)
    await reset(page)
  })

  test("follows an edit made in another tab, and that tab's Reset", async ({ page, context }) => {
    await freshBoard(page)
    const other = await context.newPage()
    await other.goto("/product-roadmap")
    await expect(persistence(other)).toHaveText("Edits save in this browser")
    await card(other, "Staff seats").getByRole("button", { name: "Move to Now", exact: true }).click()
    await expect(persistence(other)).toHaveText("Saved in this browser")

    // No reload on the first tab: the storage event re-hydrated it.
    await expect(column(page, "Now").getByRole("article", { name: "Staff seats", exact: true })).toBeVisible()
    expect(await titlesIn(page, "Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Staff seats"])
    await expect(persistence(page)).toHaveText("Saved in this browser")

    await reset(other)
    await expect(column(page, "Next").getByRole("article", { name: "Staff seats", exact: true })).toBeVisible()
    await expect(persistence(page)).toHaveText("Edits save in this browser")
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
    await card(page, "Flag Football 2026").getByRole("button", { name: "Move down", exact: true }).click()
    // The edit still shows for the session; the note tells the truth.
    expect(await titlesIn(page, "Now")).toEqual(["Play share links", "Flag Football 2026", "iPad forced updates"])
    await expect(persistence(page)).toHaveText("Couldn't save in this browser")
    await expect(persistence(page)).toHaveAttribute("role", "alert")
    expect(await savedCopy(page)).toBeNull()
  })

  test("shows an empty board, per-column empties, and no sample labels when every bet is gone", async ({ page }) => {
    await page.goto("/product-roadmap")
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ items: [], nextId: 1 })), STORAGE_KEY)
    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(page.getByRole("status", { name: "Empty board" })).toContainText("No bets on the roadmap")
    for (const name of ["Now", "Next", "Later"]) {
      await expect(column(page, name)).toContainText(`Nothing in ${name}`)
      await expect(cardsIn(page, name)).toHaveCount(0)
    }
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(page.getByTestId("sample-data-badge")).toHaveCount(0)
    await expect(sampleNote(page)).toHaveCount(0)

    // One column empty while the board still has bets.
    await reset(page)
    await card(page, "Auto-scout from film").getByRole("button", { name: "Move to Next", exact: true }).click()
    await card(page, "Parent recap emails").getByRole("button", { name: "Move to Next", exact: true }).click()
    await expect(column(page, "Later")).toContainText("Nothing in Later")
    await expect(page.getByRole("status", { name: "Empty board" })).toHaveCount(0)
    await reset(page)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(8)
  })
})
