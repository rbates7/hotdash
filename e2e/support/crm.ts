import { expect, type Locator, type Page } from "@playwright/test"

import type { LiveGmailSummary } from "../../src/lib/crm/gmail-summary"

import { liveGmailSummary } from "./gmail"
import { CLEAR_CONFIRM_NAME, NOTE, NOTE_NAME, persistenceNote } from "./persistence"

/**
 * The CRM with no sample rows. Gmail not connected (the real server with no
 * credentials, as in CI) shows a Not connected panel on every screen and
 * only the contacts the founder added in this browser; the fixture inbox
 * comes from a mocked `/api/crm/gmail` (`mockGmail`, `./gmail`).
 */

export const CRM_STORAGE_KEY = "hotdash.crm.v1"

/** Mirrored from `LEDE` / `CONNECTING_LEDE` in `@/components/crm/crm-shell`. */
export const CRM_LEDE = "Conversations, contacts, and triage — from the support inbox once Gmail is connected"
export const CRM_CONNECTING_LEDE = "Loading your CRM…"
/** Mirrored from `loadingLede` in `@/components/crm/crm-shell`. */
export function crmLoadingLede(path: string) {
  if (path.startsWith("/crm/contacts")) return "Loading your contacts…"
  if (path.startsWith("/crm/triage")) return "Loading triage…"
  if (path.startsWith("/crm/accounts")) return "Loading your accounts…"
  if (path === "/crm" || path === "/crm/") return CRM_CONNECTING_LEDE
  return "Loading your cases…"
}
/** `liveLede("info@chlkapp.com")`: the lede once the fixture inbox (or the stale copy) has answered. */
export const CRM_LIVE_LEDE = "Conversations, contacts, and triage from info@chlkapp.com"

/* ------------------------------------------------- the header and ⋯ menu */

/** Mirrored from `@/components/crm/crm-shell` and `@/components/crm/crm-header-menu`. */
export const FIND_CONTACT = "Find a contact…"
export const CRM_MENU_LABEL = "CRM menu"
export const GMAIL_CONNECT = "Connect…"
export const CLEAR_MY_ENTRIES = "Clear my entries"
/** `GMAIL_READ_ONLY_NOTE`: the menu's storage line on Contacts / Triage while Gmail is live. */
export const GMAIL_READ_ONLY_NOTE = "Read-only · edits here aren't saved"
/** `EDITS_NOTE`: under the Cases filter bar, in the case panel, and the menu's line on Overview / Cases / Accounts. */
export const EDITS_NOTE = "Edits save in this browser"

/** Exactly these section tabs, in this order (Triage carries its count while live). */
export const CRM_TABS = ["Overview", "Cases", "Accounts", "Triage", "Contacts"] as const

/** The CRM header row: the title and lede, Find a contact… and the ⋯ menu button. */
export function crmHeader(page: Page) {
  return page.getByRole("main").locator("header").first()
}

/** The ghost ⋯ button that opens the header menu. */
export function crmMenuButton(page: Page) {
  return crmHeader(page).getByRole("button", { name: CRM_MENU_LABEL, exact: true })
}

/** The header menu's popup. It is portalled out of the header, so it is found on the page. */
export function crmMenu(page: Page) {
  return page.getByTestId("crm-header-menu")
}

/** Gmail's source badge, inside the menu (open it first). */
export function crmSource(page: Page) {
  return crmMenu(page).getByTestId("crm-source")
}

/** "Clear my entries", a menu item (aria-disabled when nothing is saved); open the menu first. */
export function clearMenuItem(page: Page) {
  return crmMenu(page).getByRole("menuitem", { name: CLEAR_MY_ENTRIES, exact: true })
}

/** The menu's storage line by role and name (`persistenceNote`); open the menu first. */
export function crmNote(page: Page, { failed = false } = {}) {
  return crmMenu(page).getByRole(failed ? "alert" : "status", { name: NOTE_NAME, exact: true })
}

/**
 * Open the header's ⋯ menu (if it is not open already) and return it. A
 * click that lands before hydration does nothing, so it is retried.
 */
export async function openCrmMenu(page: Page): Promise<Locator> {
  const menu = crmMenu(page)
  await expect(async () => {
    if (!(await menu.isVisible())) await crmMenuButton(page).click()
    await expect(menu).toBeVisible({ timeout: 1_000 })
  }).toPass()
  return menu
}

/**
 * Close the menu (Escape returns focus to its button). The menu is modal,
 * so close it before touching anything outside it (the theme toggle, tabs).
 */
export async function closeCrmMenu(page: Page) {
  const menu = crmMenu(page)
  if (await menu.isVisible()) await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
}

/**
 * Open the menu, check Gmail's source badge, close it again. `text` and
 * `source` (its `data-source`) are optional: with neither, it only waits for
 * the badge (the first answer from /api/crm/gmail).
 */
export async function expectCrmSource(page: Page, text?: string | RegExp, source?: string) {
  await openCrmMenu(page)
  const badge = crmSource(page)
  await expect(badge).toBeVisible()
  if (text !== undefined) await expect(badge).toHaveText(text)
  if (source !== undefined) await expect(badge).toHaveAttribute("data-source", source)
  await closeCrmMenu(page)
}

/** Open the menu, check where edits live (the storage line), close it again. */
export async function expectCrmNote(page: Page, text: string | RegExp) {
  await openCrmMenu(page)
  await expect(crmNote(page)).toHaveText(text)
  await closeCrmMenu(page)
}

/**
 * Clear my entries from the ⋯ menu, through the shared confirm ("Clear my
 * entries?" → "Clear"), which also clears this browser's case edits.
 */
export async function clearCrmEntries(page: Page) {
  await openCrmMenu(page)
  const clear = clearMenuItem(page)
  await expect(clear).not.toHaveAttribute("aria-disabled", "true")
  await clear.click()
  await expect(crmMenu(page)).toBeHidden()
  const dialog = page.getByRole("dialog", { name: CLEAR_CONFIRM_NAME, exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Mirrored from `@/components/crm/gmail-not-connected`. */
export const GMAIL_HINT =
  "Connect the support inbox (Gmail) in Settings › Connected data and its conversations show here."
/** One panel per screen; Overview has two (`OVERVIEW_PANEL_TITLES`). */
export const GMAIL_PANEL_TITLES = {
  cases: "Cases from the support inbox",
  accounts: "Accounts from the support inbox",
  contacts: "People who email the support inbox",
  triage: "Unknown senders from the support inbox",
} as const

/** The rebuilt Overview's two list cards, each its own panel (in DOM order). */
export const OVERVIEW_PANEL_TITLES = ["Cases waiting on you", "Recent support inbox activity"] as const

export type CrmScreen = "overview" | keyof typeof GMAIL_PANEL_TITLES

/** The Not connected panel(s) a CRM screen shows while Gmail is not connected. */
export function gmailPanel(page: Page) {
  return page.getByRole("main").getByTestId("crm-not-connected")
}

/**
 * The panel(s) for `screen`: title, the hint and the Not connected badge.
 * Returns the (first) panel.
 */
export async function expectGmailPanel(page: Page, screen: CrmScreen) {
  const titles: readonly string[] = screen === "overview" ? OVERVIEW_PANEL_TITLES : [GMAIL_PANEL_TITLES[screen]]
  const panels = gmailPanel(page)
  await expect(panels).toHaveCount(titles.length)
  for (const [i, title] of titles.entries()) {
    const panel = panels.nth(i)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute("data-source", "not_connected")
    await expect(panel).toHaveAccessibleName(`${title}: not connected`)
    await expect(panel.getByTestId("not-connected")).toHaveText("Not connected")
    await expect(panel.getByText(title, { exact: true })).toBeVisible()
    await expect(panel.getByText(GMAIL_HINT, { exact: true })).toBeVisible()
  }
  return panels.first()
}

/** Mirrored from `NO_CASES` in `@/components/crm/cases-screen`: Cases, connected with no cases. */
export const NO_CASES = "No cases yet. Conversations from the support inbox show here."

/** The fixture inbox's Overview "Open" tile: three cases not closed (roster, invoice, assistants). */
export const LIVE_OPEN_TILE = "3 Open"

/** The Overview's six count cards (`data-count`), in order, with their labels. */
export const OVERVIEW_COUNTS = [
  ["open", "Open"],
  ["waitingOnUs", "Waiting on you"],
  ["waitingOnThem", "Waiting on them"],
  ["urgentOpen", "Urgent, not closed"],
  ["overdue", "Waiting on you over 3 days"],
  ["closedThisWeek", "Closed this week"],
] as const

/**
 * Every Overview count card says Not connected and shows no number. A label
 * holds a digit ("over 3 days"), so this looks for the count's own number
 * (`.tabular-nums`), never a digit anywhere in the card.
 */
export async function expectCountsNotConnected(page: Page) {
  const counts = page.getByRole("main").getByTestId("crm-count")
  await expect(counts).toHaveCount(OVERVIEW_COUNTS.length)
  for (const [i, [key, label]] of OVERVIEW_COUNTS.entries()) {
    const count = counts.nth(i)
    await expect(count).toHaveAttribute("data-count", key)
    await expect(count).toContainText(label)
    await expect(count.getByTestId("not-connected")).toHaveText("Not connected")
    await expect(count.locator(".tabular-nums")).toHaveCount(0)
    await expect(count.getByRole("link")).toHaveCount(0)
  }
}

/* --------------------------------------------------- the fixture inbox */

/** The fixture inbox's cases (`src/test/gmail-fixture.ts`), by subject. */
export const LIVE_CASES = {
  roster: "Roster import fails on a CSV with accents",
  invoice: "Annual invoice for Summit Prep",
  assistants: "Can assistants share one playbook?",
  refund: "Refund for a duplicate charge",
} as const

/** Its people: Dana has two cases (roster, assistants); Kelly and Ben one each. */
export const LIVE_PEOPLE = {
  dana: { name: "Dana Ortiz", email: "dortiz@example.org" },
  kelly: { name: "Kelly Nguyen", email: "knguyen@example.com" },
  ben: { name: "Ben Carter", email: "ben.carter@example.com" },
} as const

/** Its unknown senders: two triage cards. */
export const LIVE_TRIAGE = { sam: "Sam Patel", jordan: "Jordan Lee" } as const

/**
 * Gmail connected with nothing in the inbox: every screen's empty state.
 * Edits made while live belong to the page they were made on (the CRM's
 * provider lives in each page, and nothing is saved), so an empty inbox is
 * the way to reach the empty states, not deleting rows across pages.
 */
export function emptyLiveSummary(nowMs = Date.now()): LiveGmailSummary {
  return { ...liveGmailSummary(nowMs), data: { organizations: [], contacts: [], cases: [], messages: [] } }
}

export function liveCase(summary: LiveGmailSummary, subject: string) {
  const found = summary.data.cases.find((c) => c.subject === subject)
  if (!found) throw new Error(`fixture inbox has no case "${subject}"`)
  return found
}

export function liveContact(summary: LiveGmailSummary, email: string) {
  const found = summary.data.contacts.find((c) => c.email === email)
  if (!found) throw new Error(`fixture inbox has no contact ${email}`)
  return found
}

/**
 * Plans on two of the inbox's contacts (Stripe's job one day), so plan
 * pills have something to show: Dana on Annual, Ben's Monthly canceled.
 */
export function withPlans(summary: LiveGmailSummary): LiveGmailSummary {
  const plans: Record<string, { plan: "Annual" | "Monthly"; planStatus: string }> = {
    [LIVE_PEOPLE.dana.email]: { plan: "Annual", planStatus: "active" },
    [LIVE_PEOPLE.ben.email]: { plan: "Monthly", planStatus: "canceled" },
  }
  return {
    ...summary,
    data: {
      ...summary.data,
      contacts: summary.data.contacts.map((c) => (plans[c.email] ? { ...c, ...plans[c.email] } : c)),
    },
  }
}

/** The inbox with only the cases in `caseIds` (and their messages); triage threads stay. */
export function keepCases(summary: LiveGmailSummary, caseIds: readonly string[]): LiveGmailSummary {
  const keep = new Set(caseIds)
  return {
    ...summary,
    data: {
      ...summary.data,
      cases: summary.data.cases.filter((c) => keep.has(c.id)),
      messages: summary.data.messages.filter((m) => m.caseId === null || keep.has(m.caseId)),
    },
  }
}

/* ---------------------------------------- the founder's own contacts */

export type OwnContact = {
  email: string
  firstName: string | null
  lastName: string | null
  organization?: string | null
}

/** Two contacts the founder added by hand: one with an organization, one without. */
export const OWN_CONTACTS: readonly OwnContact[] = [
  { email: "pat.reyes@example.org", firstName: "Pat", lastName: "Reyes", organization: "Katy ISD" },
  { email: "lee.morgan@example.com", firstName: "Lee", lastName: "Morgan", organization: null },
]

/** Ids for saved own rows: clear of every id the old sample used. */
export const OWN_ID_BASE = 900

/**
 * A saved CRM copy holding only `contacts`, added by hand (`source:
 * "manual"`) — the shape the store writes to `hotdash.crm.v1`. Ids start at
 * OWN_ID_BASE (`contact-900`, `org-900`); counters sit past them so the copy
 * validates.
 */
export function ownCrmState(contacts: readonly OwnContact[] = OWN_CONTACTS, nowMs = Date.now()) {
  const orgs = new Map<string, { id: string; name: string; domain: string | null }>()
  const rows = contacts.map((c, i) => {
    let organizationId: string | null = null
    if (c.organization) {
      let org = orgs.get(c.organization)
      if (!org) {
        org = { id: `org-${OWN_ID_BASE + orgs.size}`, name: c.organization, domain: null }
        orgs.set(c.organization, org)
      }
      organizationId = org.id
    }
    return {
      id: `contact-${OWN_ID_BASE + i}`,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      nameSource: c.firstName || c.lastName ? "manual" : null,
      organizationId,
      plan: null,
      planStatus: null,
      source: "manual",
      createdAt: new Date(nowMs - (i + 1) * 60_000).toISOString(),
    }
  })
  const next = OWN_ID_BASE + 1000
  return {
    organizations: [...orgs.values()],
    contacts: rows,
    cases: [],
    messages: [],
    notes: [],
    ignoredSenders: [],
    nextOrgId: next,
    nextContactId: next,
    nextCaseId: next,
    nextMessageId: next,
    nextNoteId: next,
    nextCaseNumber: next,
  }
}

export function ownContactName(c: OwnContact) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email
}

/**
 * Open `path` with `contacts` saved as the founder's own in this browser
 * (Gmail not connected), past the loading state: the ⋯ menu's note reads
 * Saved (the menu is closed again afterwards).
 */
export async function openWithOwnContacts(page: Page, path: string, contacts: readonly OwnContact[] = OWN_CONTACTS) {
  await page.goto(path)
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [CRM_STORAGE_KEY, JSON.stringify(ownCrmState(contacts))] as const
  )
  await page.reload()
  await openCrmMenu(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
  await closeCrmMenu(page)
}
