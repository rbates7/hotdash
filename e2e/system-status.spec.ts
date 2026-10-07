import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"

/**
 * System Status: one verdict, seven seeded rows, one past incident. Nothing
 * is persisted and nothing is polled; the not-green view is a URL preview.
 *
 * Every lookup is anchored to a named region (`Current status`,
 * `Components`, `Past incident`, the `Preview` group) or to the sidebar
 * rail — the shared sidebar has no named `nav` landmark yet, so, as on
 * Home, the rail is found by its slot and the link by role inside it.
 */
const rail = (page: Page) => page.locator('[data-slot="sidebar"]').first()
const main = (page: Page) => page.getByRole("main")
const banner = (page: Page) => main(page).getByRole("region", { name: "Current status", exact: true })
const components = (page: Page) => main(page).getByRole("region", { name: "Components", exact: true })
const incident = (page: Page) => main(page).getByRole("region", { name: "Past incident", exact: true })
const preview = (page: Page) => main(page).getByRole("group", { name: "Preview", exact: true })
const row = (page: Page, name: string) => components(page).getByRole("listitem", { name, exact: true })
const sampleNote = (page: Page) => main(page).getByRole("note", { name: "Sample data" })
const headerTag = (page: Page) => main(page).locator("header").getByTestId("sample-data-tag")
const componentsTag = (page: Page) => components(page).getByTestId("sample-data-tag")

const ROWS = ["iPad app API", "Sync", "Auth", "Billing", "chlkapp.com", "Export", "Sentry errors (24h)"]

async function setTheme(page: Page, theme: "light" | "dark") {
  await rail(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

/** Every row shows its state as icon + word, never a colour alone. */
async function expectStatus(page: Page, name: string, status: "operational" | "degraded" | "down") {
  const label = row(page, name).getByTestId("status-label")
  await expect(label).toHaveAttribute("data-status", status)
  await expect(label).toHaveText({ operational: "Operational", degraded: "Degraded", down: "Down" }[status])
  await expect(label.locator("svg[data-status-icon]")).toHaveCount(1)
  await expect(row(page, name).locator("time")).toHaveText(/^Checked (just now|\d+ min ago) · \d{1,2}:\d{2} (AM|PM) CT$/)
}

test.describe("System Status", () => {
  test("is reachable from the sidebar and shows the green verdict", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "System Status", exact: true }).click()
    await expect(page).toHaveURL(/\/system-status$/)
    await expect(main(page).getByRole("heading", { level: 1, name: "System Status" })).toBeVisible()
    await expect(rail(page).getByRole("link", { name: "System Status", exact: true })).toHaveAttribute("data-active")
    await expect(rail(page).getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("data-active")

    // One verdict.
    await expect(banner(page)).toHaveAttribute("data-verdict", "green")
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await expect(banner(page)).toContainText("Every check passed. Nothing needs you.")
    // Seeded two minutes before the request, so the real clock reads it back as such.
    await expect(banner(page).locator("time")).toHaveText("Updated 2 min ago")
    await expect(banner(page)).toContainText("7 operational")
    await expect(banner(page).locator("svg[data-status-icon]")).toHaveCount(1)

    // Seven rows from the mock (+ Sentry), every one operational with a reason.
    await expect(components(page).getByRole("listitem")).toHaveCount(7)
    for (const name of ROWS) await expectStatus(page, name, "operational")
    await expect(components(page)).toContainText("None down")
    await expect(row(page, "chlkapp.com")).toContainText("Site up · 200 from Dallas")
    await expect(row(page, "chlkapp.com").locator("time")).toHaveText(/^Checked 2 min ago/)
    await expect(row(page, "Export").locator("time")).toHaveText(/^Checked 6 min ago/)

    // Plain external links to Sentry and the site; no bug list anywhere.
    const sentry = main(page).locator("header").getByRole("link", { name: "Sentry", exact: true })
    await expect(sentry).toHaveAttribute("href", "https://chlk.sentry.io")
    await expect(sentry).toHaveAttribute("target", "_blank")
    await expect(row(page, "chlkapp.com").getByRole("link", { name: "chlkapp.com", exact: true })).toHaveAttribute("href", "https://chlkapp.com")
    await expect(main(page).getByRole("table")).toHaveCount(0)
    await expect(incident(page)).toContainText("Resolved · Sync delay after the iPad 1.4 push. Cleared in 41 min. No open incident.")
    await expect(incident(page).locator("time")).toHaveText(/^\d{1,2} \w{3} \d{4}$/)
  })

  test("switches to the not-green preview and back; the preview lives in the URL, not the browser", async ({ page }) => {
    await page.goto("/system-status")
    await expect(preview(page).getByRole("link", { name: "Green", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(preview(page).getByRole("link", { name: "Not green", exact: true })).not.toHaveAttribute("aria-current")

    await preview(page).getByRole("link", { name: "Not green", exact: true }).click()
    await expect(page).toHaveURL(/\/system-status\?preview=not-green$/)
    await expect(preview(page).getByRole("link", { name: "Not green", exact: true })).toHaveAttribute("aria-current", "page")

    // One degraded row makes the whole page not green; it is named, with its reason.
    await expect(banner(page)).toHaveAttribute("data-verdict", "not-green")
    await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
    await expect(banner(page)).toContainText("Billing is degraded · Stripe webhook delay. Other systems operational.")
    await expect(banner(page)).toContainText("6 operational · 1 degraded")
    await expectStatus(page, "Billing", "degraded")
    await expect(row(page, "Billing")).toContainText("Stripe webhook delay")
    for (const name of ROWS.filter((n) => n !== "Billing")) await expectStatus(page, name, "operational")
    await expect(components(page)).toContainText("None down")

    // Back is a plain navigation; nothing was stored for this screen.
    await page.goBack()
    await expect(page).toHaveURL(/\/system-status$/)
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hotdash.system-status")))).toEqual([])

    // An unknown preview falls back to green rather than erroring.
    await page.goto("/system-status?preview=purple")
    await expect(banner(page)).toHaveAttribute("data-verdict", "green")
  })

  test("every text node reads at ≥ 4.5:1 in both themes and both states, including the solid amber Sample data labels", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/system-status", "/system-status?preview=not-green"] as const) {
        await page.goto(path)
        await setTheme(page, theme)
        const label = `${theme}/${path.endsWith("not-green") ? "not-green" : "green"}`

        // Solid amber chips: the header tag, the Components tag and the notice.
        await expect(headerTag(page)).toHaveText("Sample data")
        await expect(componentsTag(page)).toHaveText("Sample data")
        await expectReadable(headerTag(page), `${label}/header tag`, expect)
        await expectReadable(componentsTag(page), `${label}/components tag`, expect)
        await expectReadable(sampleNote(page), `${label}/notice`, expect)

        // The verdict banner (tinted), every row (status words included), the incident.
        const bannerNodes = await expectReadable(banner(page), `${label}/banner`, expect)
        expect(bannerNodes.map((n) => n.text)).toContain(path.endsWith("not-green") ? "Not green" : "All systems green")
        const rowNodes = await expectReadable(components(page), `${label}/components`, expect)
        expect(rowNodes.filter((n) => n.text === "Operational").length).toBeGreaterThanOrEqual(6)
        if (path.endsWith("not-green")) expect(rowNodes.map((n) => n.text)).toContain("Degraded")
        await expectReadable(incident(page), `${label}/incident`, expect)
        await expectReadable(preview(page), `${label}/preview toggle`, expect)
      }
    }
    await page.goto("/system-status")
    await setTheme(page, "light")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await page.goto("/system-status?preview=not-green")
    await setTheme(page, "light")
    // One shared probe for every screen; if it stopped seeing unreadable
    // text, every contrast assertion above would pass vacuously.
    await expectProbeCatchesSabotage(headerTag(page), "header tag", expect)
    await expectProbeCatchesSabotage(banner(page), "banner (not green)", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(componentsTag(page), "components tag (dark)", expect)
    await expectProbeCatchesSabotage(row(page, "Billing"), "degraded row (dark)", expect)
    await setTheme(page, "light")
  })
})
