import { expect, test } from "@playwright/test"

/**
 * Opt-in: /api/crm/gmail is behind the login gate. Skipped unless GATE_E2E=1,
 * against a gated server with TEST-ONLY values (see e2e/dashboard-gate.spec.ts
 * for how to start one). Never point it at a real password.
 */
const enabled = process.env.GATE_E2E === "1"
const email = process.env.GATE_E2E_EMAIL ?? ""
const password = process.env.GATE_E2E_PASSWORD ?? ""

test.describe("CRM Gmail data behind the gate", () => {
  test.skip(!enabled, "opt-in: set GATE_E2E=1 against a gated server")
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.69" } })

  for (const path of ["/api/crm/gmail", "/api/crm/gmail?caseId=case-1"]) {
    test(`logged out, ${path} is 401 JSON with no CRM data`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(401)
      expect(res.headers()["content-type"]).toContain("application/json")
      const text = await res.text()
      expect(text).not.toContain("cases")
      expect(text).not.toContain("messages")
    })
  }

  test("a client-sent bare header does not get past the gate", async ({ request }) => {
    const res = await request.get("/api/crm/gmail", { headers: { "x-hotdash-bare": "1" }, maxRedirects: 0 })
    expect(res.status()).toBe(401)
  })

  test("logged in, the list answers with the contract envelope", async ({ page }) => {
    await page.goto("/unlock?next=%2Fcrm")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/crm$/)
    const res = await page.request.get("/api/crm/gmail")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(["connected", "stale", "connecting", "not_connected"]).toContain(body.status)
    expect(body).toHaveProperty("counts")
    expect(Array.isArray(body.cases)).toBe(true)
    expect(Array.isArray(body.accounts)).toBe(true)
    expect(Array.isArray(body.recentActivity)).toBe(true)
    expect((await page.request.get("/api/crm/gmail?caseId=nope")).status()).toBe(400)
  })
})
