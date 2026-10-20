import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { expectBorderContrast, expectReadable } from "./support/contrast"
import { vetUnmockedApi } from "./support/shots"

/**
 * Review stills for the login gate (#64), from production builds, Next
 * portal left visible. Run by scripts/gate-reshoot.sh:
 *
 * - SHOT_PHASE=before: develop, gate code absent. /unlock (a 404) and
 *   /crm (open, key-less so "Not connected").
 * - SHOT_PHASE=after: the head with THROWAWAY gate values only
 *   (scripts/shot-env.mjs THROWAWAY_GATE). /unlock, the locked redirect
 *   from /crm, and the wrong-login error.
 *
 * Stills stay on the box.
 */
test.skip(!process.env.SCREENSHOTS || !process.env.SHOT_PHASE, "set SCREENSHOTS=1 and SHOT_PHASE")

const PHASE = process.env.SHOT_PHASE as "before" | "after"
/** SHOT_ONLY=lockout: just the "Too many tries" stills (390 and 1440, light and dark). */
const ONLY_LOCKOUT = process.env.SHOT_ONLY === "lockout"
const LOCKOUT_WIDTHS = [390, 1440]
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? `test-results/gate-shots-${PHASE}`)
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

test.beforeAll(() => {
  let head = "unknown"
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  } catch {}
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, "SHAS.txt"),
    [
      `dashboard gate stills (${PHASE})`,
      `served ${process.env.SHOT_SERVER_SHA ?? head}`,
      `spec checkout ${head}`,
      "build production (next build && next start); nextjs-portal not hidden",
      ONLY_LOCKOUT ? "set: lockout only (error=limited after 5 wrong tries), 390 and 1440" : "set: unlock, locked redirect, wrong login",
      PHASE === "after" ? "gate values: throwaway test values only (@example.invalid / TEST-ONLY-)" : "gate: not in this build",
      "",
    ].join("\n")
  )
})

async function open(page: Page, url: string, theme: "light" | "dark") {
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme)
  await page.goto(url)
  await page.waitForLoadState("networkidle")
  const html = page.locator("html")
  await expect(html).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await page.waitForTimeout(300)
}

/** Text at 4.5:1, field edges at 3:1, and no sideways scroll. */
async function expectFormReadable(page: Page) {
  const form = page.locator("form")
  await expectReadable(form, "unlock form", expect)
  await expectBorderContrast(form.locator("input:not([type=hidden])"), "unlock fields", expect)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    if (ONLY_LOCKOUT) continue
    test(`${PHASE} at ${vp.width} ${theme}`, async ({ browser }) => {
      // Its own client key, so the wrong-login still never trips the rate limit.
      const context = await browser.newContext({
        viewport: vp,
        extraHTTPHeaders: { "x-forwarded-for": `10.64.${vp.width % 256}.${theme === "dark" ? 1 : 2}` },
      })
      const page = await context.newPage()
      const noLiveData = await vetUnmockedApi(page)
      // The login form post (and its redirect) goes straight to the server.
      await page.route("**/api/gate/**", (route) => route.continue())
      const tag = `${vp.width}-${theme}`

      await open(page, "/unlock", theme)
      if (PHASE === "after") await expectFormReadable(page)
      await shoot(page, `unlock-${PHASE}-${tag}`)

      await open(page, "/crm", theme)
      if (PHASE === "after") {
        await expect(page).toHaveURL(/\/unlock\?next=%2Fcrm$/)
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
      }
      await shoot(page, `locked-redirect-${PHASE}-${tag}`)

      if (PHASE === "after") {
        await page.getByLabel("Email").fill("someone@example.invalid")
        await page.getByLabel("Password").fill("not-the-password")
        await page.getByRole("button", { name: "Sign in" }).click()
        await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible()
        await expectFormReadable(page)
        await page.waitForTimeout(300)
        await shoot(page, `unlock-error-${PHASE}-${tag}`)
      }
      noLiveData()
      await context.close()
    })
  }
}

// Lockout ("Too many tries"): 5 real wrong logins from one client key, then
// the 6th lands on /unlock?error=limited. Runs with the after set, or alone
// with SHOT_ONLY=lockout.
for (const vp of WIDTHS.filter((w) => LOCKOUT_WIDTHS.includes(w.width))) {
  for (const theme of ["light", "dark"] as const) {
    test(`${PHASE} lockout at ${vp.width} ${theme}`, async ({ browser, baseURL }) => {
      test.skip(PHASE !== "after", "the lockout exists only with the gate")
      const key = `10.65.${vp.width % 256}.${theme === "dark" ? 1 : 2}`
      const context = await browser.newContext({ viewport: vp, extraHTTPHeaders: { "x-forwarded-for": key } })
      const page = await context.newPage()
      const noLiveData = await vetUnmockedApi(page)
      await page.route("**/api/gate/**", (route) => route.continue())
      for (let i = 0; i < 5; i++) {
        const res = await context.request.post("/api/gate/login", {
          form: { email: "someone@example.invalid", password: `not-the-password-${i}`, next: "/crm" },
          headers: { origin: baseURL! },
          maxRedirects: 0,
        })
        expect(res.status()).toBe(303)
      }
      await open(page, "/unlock?next=%2Fcrm", theme)
      await page.getByLabel("Email").fill("someone@example.invalid")
      await page.getByLabel("Password").fill("not-the-password")
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page).toHaveURL(/error=limited/)
      await expect(page.getByRole("alert").filter({ hasText: "Too many tries" })).toBeVisible()
      expect((await context.cookies()).some((c) => c.name === "hotdash_gate")).toBe(false)
      await expectFormReadable(page)
      await page.waitForTimeout(300)
      await shoot(page, `unlock-lockout-${PHASE}-${vp.width}-${theme}`)
      noLiveData()
      await context.close()
    })
  }
}
