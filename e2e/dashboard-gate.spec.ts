import { expect, test } from "@playwright/test"

/**
 * Opt-in: the login gate, end to end. Skipped unless GATE_E2E=1.
 *
 * The default suite runs with both gate settings blank (gate off), so this
 * needs its own server with TEST-ONLY values, e.g. on another port:
 *
 *   DASHBOARD_LOGIN_EMAIL=gate-e2e@example.invalid \
 *   DASHBOARD_GATE_SECRET=<a throwaway test password> pnpm start --port 3002
 *   GATE_E2E=1 PORT=3002 GATE_E2E_EMAIL=gate-e2e@example.invalid \
 *   GATE_E2E_PASSWORD=<same throwaway password> pnpm exec playwright test e2e/dashboard-gate.spec.ts
 *
 * Never point it at a real password.
 */
const enabled = process.env.GATE_E2E === "1"
const email = process.env.GATE_E2E_EMAIL ?? ""
const password = process.env.GATE_E2E_PASSWORD ?? ""

test.describe("dashboard login gate", () => {
  test.skip(!enabled, "opt-in: set GATE_E2E=1 against a gated server (see the file header)")
  // Its own client key for the per-instance wrong-login limit.
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.64" } })

  test("a locked page goes to /unlock, then the right login returns to it", async ({ page }) => {
    await page.goto("/crm")
    await expect(page).toHaveURL(/\/unlock\?next=%2Fcrm$/)
    await expect(page.getByRole("navigation")).toHaveCount(0)
    await page.getByLabel("Email").fill(`  ${email.toUpperCase()} `)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/crm$/)
    await page.reload()
    await expect(page).toHaveURL(/\/crm$/)
  })

  test("a wrong password shows the generic error and sets no cookie", async ({ page, context }) => {
    await page.goto("/unlock")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(`${password}-wrong`)
    await page.getByRole("button", { name: "Sign in" }).click()
    // Next's route announcer is also role=alert; pick ours by text.
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toHaveText("That email and password didn't work. Try again.")
    expect((await context.cookies()).some((c) => c.name === "hotdash_gate")).toBe(false)
  })

  test("APIs, health included, are 401 without the cookie", async ({ request }) => {
    for (const path of ["/api/inbox", "/api/health/stripe"]) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(401)
    }
  })

  test("GET /api/subscriptions/paying is 401 without the cookie, with no counts (#67)", async ({ request }) => {
    const res = await request.get("/api/subscriptions/paying", { maxRedirects: 0 })
    expect(res.status()).toBe(401)
    expect(await res.text()).not.toMatch(/counts|appStore|stripe|invoice/i)
  })

  test("an off-site next is ignored", async ({ page }) => {
    await page.goto("/unlock?next=//example.com")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    // Lands on the dashboard root (which itself redirects to /home), never off-site.
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(home)?$/)
  })
})
