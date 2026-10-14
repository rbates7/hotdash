import { expect, test, type Locator, type Page } from "@playwright/test"

import { SETTINGS_KEY } from "../src/lib/settings"
import { expectReadable } from "./support/contrast"
import { founderNav, founderNavDrawer, openFounderNav } from "./support/nav"
import { setTheme } from "./support/theme"
import { expectNoOverflowX, pageOverflowX, waitForHydration } from "./support/shell"

const main = (page: Page) => page.getByRole("main")
const section = (page: Page, name: string) =>
  main(page).getByRole("region", { name, exact: true })
const appearance = (page: Page) =>
  section(page, "Appearance").getByRole("group", { name: "Appearance mode" })
const settingsLink = (page: Page) =>
  page.locator("[data-slot='sidebar-footer']").getByRole("link", { name: "Settings", exact: true })

async function gotoSettings(page: Page) {
  await page.goto("/settings")
  await waitForHydration(page)
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
}

/** Labels of the screen links in the founder rail, top to bottom. */
async function navLabels(page: Page) {
  return (await founderNav(page).getByRole("link").allInnerTexts()).map((t) => t.trim())
}

async function storedSettings(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), SETTINGS_KEY)
}

test.describe("Settings (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("opens from the sidebar footer, above Help", async ({ page }) => {
    await page.goto("/home")
    await waitForHydration(page)
    const footer = page.locator("[data-slot='sidebar-footer']")
    const link = settingsLink(page)
    const help = footer.getByRole("button", { name: "Help", exact: true })
    const [linkBox, helpBox] = [await link.boundingBox(), await help.boundingBox()]
    expect(linkBox!.y).toBeLessThan(helpBox!.y)
    await link.click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
    await expect(settingsLink(page)).toHaveAttribute("aria-current", "page")
    for (const name of ["Appearance", "Time zone", "Goals and targets", "Sample data", "Connected data", "Sidebar"]) {
      await expect(section(page, name)).toBeVisible()
    }
    const connected = section(page, "Connected data")
    for (const source of ["Stripe", "PostHog", "Sentry", "Gmail"]) {
      await expect(connected.getByText(source, { exact: true })).toBeVisible()
    }
    await expect(connected.getByText("Not connected", { exact: true })).toHaveCount(4)
  })

  test("appearance drives the real theme provider", async ({ page }) => {
    await gotoSettings(page)
    const html = page.locator("html")
    await appearance(page).getByRole("button", { name: "Light" }).click()
    await expect(html).not.toHaveClass(/\bdark\b/)
    await appearance(page).getByRole("button", { name: "Dark" }).click()
    await expect(html).toHaveClass(/\bdark\b/)

    await page.emulateMedia({ colorScheme: "light" })
    await appearance(page).getByRole("button", { name: "Match device" }).click()
    await expect(html).not.toHaveClass(/\bdark\b/)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(appearance(page).getByRole("button", { name: "Match device" })).toHaveAttribute("aria-pressed", "true")
  })

  test("goals: invalid input shows an inline error and is not saved; valid saves", async ({ page }) => {
    await gotoSettings(page)
    const goals = section(page, "Goals and targets")
    const revenue = goals.getByLabel("Monthly revenue goal")
    const churn = goals.getByLabel("Churn limit")

    await revenue.fill("lots")
    await churn.fill("140")
    await goals.getByRole("button", { name: "Save goals" }).click()
    await expect(revenue).toHaveAttribute("aria-invalid", "true")
    await expect(revenue).toHaveAccessibleDescription(/whole-dollar amount/)
    await expect(churn).toHaveAccessibleDescription(/can't be more than 100/)
    await expect(goals.getByText("Goals saved.")).toHaveCount(0)
    expect(await storedSettings(page)).toBeNull()

    await revenue.fill("$25,000")
    await churn.fill("4.5")
    await goals.getByRole("button", { name: "Save goals" }).click()
    await expect(goals.getByRole("status")).toHaveText("Goals saved.")
    await expect(revenue).not.toHaveAttribute("aria-invalid", "true")
    await expect(revenue).toHaveValue("25000")
    expect((await storedSettings(page)).goals).toEqual({ monthlyRevenue: 25000, trialToPaid: null, churnLimit: 4.5 })
  })

  test("sidebar: hide a screen, move one up, reload and everything persists", async ({ page }) => {
    await gotoSettings(page)
    const before = await navLabels(page)
    expect(before.slice(0, 3)).toEqual(["Home", "My Desk", "Metrics"])

    const sidebar = section(page, "Sidebar")
    await expect(sidebar.getByRole("switch", { name: "Show Home" })).toHaveCount(0)
    await sidebar.getByRole("switch", { name: "Show Bugs" }).click()
    await expect(founderNav(page).getByRole("link", { name: "Bugs", exact: true })).toHaveCount(0)
    await sidebar.getByRole("button", { name: "Move Metrics up" }).click()
    await expect.poll(() => navLabels(page)).toEqual(
      ["Home", "Metrics", "My Desk", ...before.slice(3)].filter((l) => l !== "Bugs")
    )

    // The rest of Settings, so the reload checks every kind of setting.
    await appearance(page).getByRole("button", { name: "Light" }).click()
    await section(page, "Goals and targets").getByLabel("Trial-to-paid target").fill("18")
    await section(page, "Goals and targets").getByRole("button", { name: "Save goals" }).click()
    await section(page, "Sample data").getByRole("switch", { name: "Show Sample data labels" }).click()
    await section(page, "Time zone").getByRole("combobox").click()
    await page.getByRole("option", { name: "Pacific" }).click()
    await expect(page.getByTestId("settings-clock")).toContainText(/P[DS]T/)

    await page.reload()
    await waitForHydration(page)
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
    await expect(appearance(page).getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true")
    await expect(section(page, "Goals and targets").getByLabel("Trial-to-paid target")).toHaveValue("18")
    await expect(section(page, "Sample data").getByRole("switch", { name: "Show Sample data labels" })).not.toBeChecked()
    await expect(section(page, "Time zone").getByRole("combobox")).toContainText("Pacific")
    await expect(sidebar.getByRole("switch", { name: "Show Bugs" })).not.toBeChecked()
    await expect.poll(() => navLabels(page)).toEqual(
      ["Home", "Metrics", "My Desk", ...before.slice(3)].filter((l) => l !== "Bugs")
    )

    // Sample data off reaches the screens that use the shared helper.
    await page.goto("/home")
    await waitForHydration(page)
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)

    // Reset puts the sidebar back; nothing else moves.
    await gotoSettings(page)
    await section(page, "Sidebar").getByRole("button", { name: "Reset to default" }).click()
    await expect.poll(() => navLabels(page)).toEqual(before)
    await expect(section(page, "Goals and targets").getByLabel("Trial-to-paid target")).toHaveValue("18")
  })

  test("ignores a corrupt stored copy", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "{oops"), SETTINGS_KEY)
    await gotoSettings(page)
    await expect(section(page, "Time zone").getByRole("combobox")).toContainText("Central")
    expect((await navLabels(page))[0]).toBe("Home")
  })
})

/* ------------------------------------------------------------ responsive */

/** Everything you can tap in the Settings content, plus the sidebar's Settings row. */
async function tapTargets(page: Page): Promise<{ label: string; locator: Locator }[]> {
  const m = main(page)
  const groups: [string, Locator][] = [
    ["button", m.getByRole("button")],
    ["combobox", m.getByRole("combobox")],
    ["textbox", m.getByRole("textbox")],
    // A switch's hit target is its full-row label, not the 18px track.
    ["switch row", m.locator("[data-slot='switch-row']")],
  ]
  const out: { label: string; locator: Locator }[] = []
  for (const [kind, locator] of groups) {
    const count = await locator.count()
    expect(count, `${kind}s on Settings`).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i)
      const name = (await item.getAttribute("aria-label")) ?? (await item.innerText()).trim()
      out.push({ label: `${kind} "${name}"`, locator: item })
    }
  }
  return out
}

async function expectMinTarget(locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `${label}: painted`).toBeTruthy()
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(44)
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(44)
}

for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet portrait", width: 820, height: 1180 },
  { name: "tablet landscape", width: 1180, height: 820 },
] as const) {
  test.describe(`Settings responsive (${vp.name} ${vp.width})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("every target is ≥44px, nothing overflows, text is readable in both themes", async ({ page }) => {
      await gotoSettings(page)
      for (const { label, locator } of await tapTargets(page)) {
        await expectMinTarget(locator, label)
      }
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
      await expectNoOverflowX(page)
      // Nothing inside the content is clipped past the right edge either.
      const clipped = await main(page).evaluate((root) =>
        [...root.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => el.outerHTML.slice(0, 80))
      )
      expect(clipped).toEqual([])

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        // The screen itself; the shell's avatar has its own (known) token issue.
        await expectReadable(main(page).locator("[data-slot='settings-screen']"), `Settings ${vp.width} ${theme}`, expect)
      }

      // The Settings row in the real sidebar (drawer on phone) is a 44px row too.
      const nav = await openFounderNav(page)
      await expect(nav).toBeVisible()
      const scope = vp.width < 768 ? founderNavDrawer(page) : page
      const row = scope.locator("[data-slot='sidebar-footer']").getByRole("link", { name: "Settings" })
      const box = await row.boundingBox()
      expect(box, "sidebar Settings row").toBeTruthy()
      expect(box!.height, "sidebar Settings row height").toBeGreaterThanOrEqual(44)
    })

    test("a hidden screen is gone from the real sidebar, drawer included", async ({ page }) => {
      await gotoSettings(page)
      await section(page, "Sidebar").getByRole("switch", { name: "Show Clinics" }).click()
      await section(page, "Sidebar").getByRole("button", { name: "Move CRM up" }).click()
      const nav = await openFounderNav(page)
      await expect(nav.getByRole("link", { name: "Clinics", exact: true })).toHaveCount(0)
      // By href: the 820 icon rail paints no labels.
      const hrefs = await nav.getByRole("link").evaluateAll((els) => els.map((el) => el.getAttribute("href")))
      expect(hrefs).not.toContain("/clinics")
      expect(hrefs.indexOf("/crm")).toBeLessThan(hrefs.indexOf("/sales-opportunities"))
      await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveCount(1)
    })
  })
}
