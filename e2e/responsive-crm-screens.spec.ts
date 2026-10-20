import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import {
  CRM_STORAGE_KEY as STORAGE_KEY,
  LIVE_CASES,
  LIVE_OPEN_TILE,
  LIVE_TRIAGE,
  NO_CASES,
  expectGmailPanel,
  liveCase,
  openWithOwnContacts,
} from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { CLEAR_COPY, CLEAR_DESCRIPTION } from "../src/components/persistence-note"
import { CLEAR_CONFIRM_NAME, NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for the CRM at the four target widths, both themes: Gmail
 * not connected (the panels and the founder's own contacts) and connected
 * (the fixture inbox from a mocked /api/crm/gmail). The walk and its
 * assertions run in every e2e run; the PNGs are written only with
 * SCREENSHOTS=1: `pnpm screens:responsive-crm`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-crm-screens.spec.ts`).
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/crm"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const LIVE = liveGmailSummary(Date.now())
const ROSTER = liveCase(LIVE, LIVE_CASES.roster)
const PAT = "Pat Reyes"

const main = (page: Page) => page.getByRole("main")
const source = (page: Page) => main(page).locator("header").first().getByTestId("crm-source")
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const cardList = (page: Page) => main(page).locator("[data-slot='responsive-table']").getByRole("list")

/**
 * Page states are full-page; an open sheet, dialog or menu is shot at the
 * viewport, where it really sits on the screen.
 */
async function shoot(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").or(page.getByRole("menu")).count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

/** Go to `path` and wait for the source to answer and the rows to load. */
async function visit(page: Page, pathname: string) {
  await page.goto(pathname)
  await waitForHydration(page)
  await expect(source(page)).toBeVisible()
  await expect(main(page).getByRole("status", { name: /^Loading saved/ })).toHaveCount(0)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`CRM ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const phone = size === "phone"
      const desktop = size === "desktop"
      const name = (state: string) => `crm-${size}-${state}-${theme}`

      // Gmail not connected: the panel, then the founder's own contacts under it.
      await page.goto("/crm")
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
      await visit(page, "/crm")
      await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
      await setTheme(page, theme)
      await expectGmailPanel(page, "overview")
      await shoot(page, name("overview-not-connected"))

      await openWithOwnContacts(page, "/crm/contacts")
      await expectGmailPanel(page, "contacts")
      await expect(main(page).getByText("2 people you added", { exact: true })).toBeVisible()
      await shoot(page, name("contacts"))

      // Edit contact, opened the way this width opens it.
      if (phone) {
        await cardList(page).getByRole("button", { name: new RegExp(`^${PAT}`) }).click()
        await page.getByRole("dialog", { name: PAT, exact: true }).getByRole("button", { name: "Edit contact" }).click()
      } else if (desktop) {
        await main(page).getByRole("link", { name: new RegExp(PAT) }).click()
        await expect(main(page).getByRole("heading", { level: 2, name: PAT })).toBeVisible()
        await main(page).getByRole("button", { name: "Edit", exact: true }).click()
      } else {
        await main(page).getByRole("button", { name: `More actions for ${PAT}` }).click()
        await page.getByRole("menu").getByRole("menuitem", { name: "Edit contact" }).click()
      }
      await expect(page.getByRole("dialog", { name: "Edit contact", exact: true })).toBeVisible()
      await shoot(page, name("contact-edit"), { fullPage: false })
      await closeAll(page)

      // The Clear my entries confirm (the founder's contacts are saved), at
      // every width: title, what it deletes, both choices; nothing cleared.
      await main(page).locator("header").first().getByRole("button", { name: CLEAR_COPY.button, exact: true }).click()
      const confirm = page.getByRole("dialog", { name: CLEAR_CONFIRM_NAME, exact: true })
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText(CLEAR_DESCRIPTION)
      await expect(confirm.getByRole("button", { name: "Keep my edits", exact: true })).toBeVisible()
      await expect(confirm.getByRole("button", { name: CLEAR_COPY.confirm, exact: true })).toBeVisible()
      await shoot(page, name("clear-confirm"), { fullPage: desktop })
      await closeAll(page)
      await expect(persistenceNote(page)).toHaveText(NOTE.saved)

      // Gmail connected: the fixture inbox.
      await mockGmail(page, liveGmailSummary(Date.now()))
      await visit(page, "/crm")
      await expect(source(page)).toHaveText("Live from Gmail")
      await expect(main(page).getByRole("link", { name: LIVE_OPEN_TILE, exact: true })).toBeVisible()
      await shoot(page, name("overview"))

      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
      await expect(main(page).getByRole("heading", { level: 2, name: /^Cases/ })).toBeVisible()
      await shoot(page, name("cases"))

      // Old Cases row actions (phone sheet, tablet "…") removed by the CRM rebuild; covered by e2e/crm-rebuild.spec.ts.

      // The case panel (beside the list at 1440, a sheet below 1280), where the old detail page was.
      await visit(page, `/crm/cases?case=${ROSTER.id}`)
      const panel = page.getByTestId("case-panel")
      await expect(panel).toBeVisible()
      await expect(panel).toContainText(LIVE_CASES.roster)
      await expect(panel.getByRole("list", { name: "Thread" })).toBeVisible()
      await shoot(page, name("case-panel"), { fullPage: desktop })
      await closeAll(page)

      await visit(page, "/crm/triage")
      await expect(main(page).getByText(LIVE_TRIAGE.sam)).toBeVisible()
      await shoot(page, name("triage"))

      // Empty: an inbox with no cases (its triage threads only). The newest route answers.
      const inbox = liveGmailSummary(Date.now())
      await mockGmail(page, {
        ...inbox,
        data: { ...inbox.data, cases: [], messages: inbox.data.messages.filter((m) => m.caseId === null) },
      })
      await visit(page, "/crm/cases")
      await expect(main(page).getByText(NO_CASES, { exact: true })).toBeVisible()
      await shoot(page, name("cases-empty"))
    })
  }
}
