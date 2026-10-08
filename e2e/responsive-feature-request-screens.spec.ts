import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, NOTE_NAME } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Feature Request at the four target widths, both themes.
 * Opt-in against a production build so the Next.js dev “N” badge is absent:
 * `pnpm build && CI=true SCREENSHOTS=1 playwright test e2e/responsive-feature-request-screens.spec.ts`
 * (or `pnpm screens:responsive-feature-request` after a build).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/feature-request"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.feature-requests.v1"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

const board = (page: Page) =>
  page.getByRole("region", { name: "Feature request intake", exact: true })
const card = (page: Page, title: string) =>
  board(page).getByRole("button", { name: `Open idea: ${title}`, exact: true })
const persistence = (page: Page) =>
  page.getByRole("status", { name: NOTE_NAME, exact: true })

async function open(page: Page, theme: "light" | "dark", empty: boolean) {
  await page.goto("/feature-request")
  await page.evaluate(
    ([key, clear]) => {
      if (clear) localStorage.setItem(key, JSON.stringify({ requests: [], nextId: 1 }))
      else localStorage.removeItem(key)
    },
    [STORAGE_KEY, empty] as const
  )
  await page.reload()
  await waitForHydration(page)
  await expect(persistence(page)).toHaveText(empty ? NOTE.saved : NOTE.unsaved)
  await setTheme(page, theme)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Feature Request ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)

      await open(page, theme, false)
      await expect(card(page, "Play of the Day")).toBeVisible()
      await shoot(page, `feature-request-${size}-with-data-${theme}`)

      await card(page, "Play of the Day").click()
      await expect(page.getByRole("dialog", { name: "Idea: Play of the Day" })).toBeVisible()
      await shoot(page, `feature-request-${size}-detail-${theme}`)
      await page.keyboard.press("Escape")

      await open(page, theme, true)
      await expect(page.getByRole("status", { name: "Empty board" })).toBeVisible()
      await shoot(page, `feature-request-${size}-empty-${theme}`)
    })
  }
}
