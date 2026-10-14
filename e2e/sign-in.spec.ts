import { expect, test, type Locator, type Page } from "@playwright/test"

import { ACCOUNT_HEADING, SIGN_OUT_LABEL } from "../src/components/settings/account-card"
import { AUTH_COPY } from "../src/lib/auth/messages"
import { expectReadable } from "./support/contrast"
import { emailField, passwordField, signInButton, signInThroughForm } from "./support/auth"
import { founderNav, openFounderNav } from "./support/nav"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { TEST_ADMIN_EMAIL } from "./support/test-credentials"
import { setTheme } from "./support/theme"

// Runs in the "signed-out" project: every test starts with no cookies.

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

// Scoped to main: Next's route announcer is also role="alert".
const errorAlert = (page: Page) => page.getByRole("main").getByRole("alert")
const accountCard = (page: Page) => page.getByRole("region", { name: ACCOUNT_HEADING })
const signOutButton = (page: Page) =>
  accountCard(page).getByRole("button", { name: SIGN_OUT_LABEL, exact: true })

async function signIn(page: Page, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in")
  await signInThroughForm(page)
}

async function expectMinHit(locator: Locator, label: string, min = 44) {
  const box = await locator.boundingBox()
  expect(box, label).toBeTruthy()
  // Subpixel paint (43.999) still clears a 44px token.
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(min - 0.5)
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(min - 0.5)
}

test.describe("signed out", () => {
  test("a page redirects to /sign-in with next, and shows no app shell", async ({ page }) => {
    await page.goto("/crm/cases?tab=open")
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fcrm%2Fcases%3Ftab%3Dopen$/)
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible()
    await expect(founderNav(page)).toHaveCount(0)
    await expect(page.locator("[data-slot='sidebar']")).toHaveCount(0)
    await expect(page.locator("[data-slot='app-header']")).toHaveCount(0)
  })

  test("every sidebar route is locked", async ({ page }) => {
    for (const path of ["/", "/home", "/metrics", "/settings", "/infrastructure"]) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/sign-in(\?|$)/)
    }
  })

  test("an API route answers 401 JSON", async ({ request }) => {
    const res = await request.get("/api/anything", { maxRedirects: 0 })
    expect(res.status()).toBe(401)
    expect(res.headers()["content-type"]).toContain("application/json")
    expect(await res.json()).toEqual({ error: "Not signed in." })
  })
})

test.describe("signing in", () => {
  test("a wrong password shows a clear error and stays on /sign-in", async ({ page }) => {
    await page.goto("/sign-in")
    await signInThroughForm(page, { password: "definitely-not-it" })
    await expect(errorAlert(page)).toHaveText(AUTH_COPY.incorrect)
    await expect(page).toHaveURL(/\/sign-in$/)
    // The email survives the round trip; the password does not.
    await expect(emailField(page)).toHaveValue(TEST_ADMIN_EMAIL)
    await expect(passwordField(page)).toHaveValue("")
    await expect(founderNav(page)).toHaveCount(0)
  })

  test("a good sign-in lands on Home", async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(founderNav(page).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  test("a good sign-in returns to the page that was asked for", async ({ page }) => {
    await page.goto("/metrics")
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmetrics$/)
    await signInThroughForm(page)
    await expect(page).toHaveURL(/\/metrics$/)
  })

  test("an off-site next is ignored", async ({ page }) => {
    await signIn(page, "//evil.example/steal")
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/home$/)
  })

  test("a signed-in visit to /sign-in goes Home", async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)
    await page.goto("/sign-in?next=/crm")
    await expect(page).toHaveURL(/\/home$/)
  })

  test("the session cookie is httpOnly, Lax and lasts 7 days", async ({ page, context }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)
    const [cookie] = (await context.cookies()).filter((c) => c.name === "hotdash_session")
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe("Lax")
    const days = (cookie.expires - Date.now() / 1000) / 86_400
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThanOrEqual(7)
    expect(await page.evaluate(() => document.cookie)).not.toContain("hotdash_session")
  })
})

test.describe("signing out", () => {
  test("Settings → Account shows the email and Sign out ends the session", async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)

    await page.goto("/settings")
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
    await expect(accountCard(page).getByTestId("account-email")).toHaveText(TEST_ADMIN_EMAIL)

    await signOutButton(page).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(signInButton(page)).toBeVisible()

    await page.goto("/home")
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fhome$/)
    expect((await page.request.get("/api/anything")).status()).toBe(401)
  })

  test("the sidebar's Settings link and Logout work", async ({ page }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)
    await waitForHydration(page)

    await page.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    )

    await page.getByRole("button", { name: "Logout", exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/)
  })

  test("phone: Settings and Logout are reachable from the menu drawer", async ({ page }) => {
    await page.setViewportSize(SIZES.phone)
    await signIn(page)
    await expect(page).toHaveURL(/\/home$/)
    await waitForHydration(page)

    await openFounderNav(page)
    const drawer = page.getByRole("dialog", { name: "Menu" })
    await drawer.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)

    await openFounderNav(page)
    await drawer.getByRole("button", { name: "Logout", exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})

for (const [name, viewport] of Object.entries(SIZES)) {
  test.describe(`${name} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport })

    for (const theme of ["light", "dark"] as const) {
      test(`/sign-in fits, has 44px targets under 1280, and reads in ${theme}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("theme", t), theme)
        await page.goto("/sign-in")
        await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

        if (viewport.width < 1280) {
          await expectMinHit(emailField(page), "email")
          await expectMinHit(passwordField(page), "password")
          await expectMinHit(signInButton(page), "Sign in")
        }

        // Its own email, so these parallel failures never add up to the
        // 5-per-IP+email rate limit.
        await signInThroughForm(page, {
          email: `layout-${name}-${theme}@example.test`,
          password: "definitely-not-it",
        })
        await expect(errorAlert(page)).toHaveText(AUTH_COPY.incorrect)
        await expectReadable(page.getByRole("main"), `/sign-in ${name} ${theme}`, expect)
      })

      test(`/settings fits, has 44px targets under 1280, and reads in ${theme}`, async ({ page }) => {
        await signIn(page, "/settings")
        await expect(page).toHaveURL(/\/settings$/)
        await waitForHydration(page)
        await setTheme(page, theme)

        expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
        await expect(accountCard(page)).toBeVisible()
        if (viewport.width < 1280) await expectMinHit(signOutButton(page), "Sign out")
        await expectReadable(accountCard(page), `Account ${name} ${theme}`, expect)
      })
    }
  })
}
