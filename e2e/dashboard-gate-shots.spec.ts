import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

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

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`${PHASE} at ${vp.width} ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp })
      const page = await context.newPage()
      const noLiveData = await vetUnmockedApi(page)
      // The login form post (and its redirect) goes straight to the server.
      await page.route("**/api/gate/**", (route) => route.continue())
      const tag = `${vp.width}-${theme}`

      await open(page, "/unlock", theme)
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
        await expect(page.getByRole("alert")).toBeVisible()
        await page.waitForTimeout(300)
        await shoot(page, `unlock-error-${PHASE}-${tag}`)
      }
      noLiveData()
      await context.close()
    })
  }
}
