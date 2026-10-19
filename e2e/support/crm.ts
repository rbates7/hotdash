import { expect, type Page } from "@playwright/test"

import type { LiveGmailSummary } from "../../src/lib/crm/gmail-summary"

import { NOTE, persistenceNote } from "./persistence"

/**
 * The CRM with no sample rows. Gmail not connected (the real server with no
 * credentials, as in CI) shows a Not connected panel on every screen and
 * only the contacts the founder added in this browser; the fixture inbox
 * comes from a mocked `/api/crm/gmail` (`mockGmail`, `./gmail`).
 */

export const CRM_STORAGE_KEY = "hotdash.crm.v1"

/** Mirrored from `LEDE` / `CONNECTING_LEDE` in `@/components/crm/crm-shell`. */
export const CRM_LEDE = "Conversations, contacts, and triage — from the support inbox once Gmail is connected"
export const CRM_CONNECTING_LEDE = "Conversations, contacts, and triage"

/** Mirrored from `@/components/crm/gmail-not-connected`. */
export const GMAIL_HINT =
  "Connect the support inbox (Gmail) in Settings › Connected data and its conversations show here."
export const GMAIL_PANEL_TITLES = {
  overview: "Support inbox conversations",
  cases: "Cases from the support inbox",
  contacts: "People who email the support inbox",
  triage: "Unknown senders from the support inbox",
} as const

export type CrmScreen = keyof typeof GMAIL_PANEL_TITLES

/** The Not connected panel a CRM screen shows while Gmail is not connected. */
export function gmailPanel(page: Page) {
  return page.getByRole("main").getByTestId("crm-not-connected")
}

/** The panel for `screen`: its title, the hint and the Not connected badge. */
export async function expectGmailPanel(page: Page, screen: CrmScreen) {
  const panel = gmailPanel(page)
  await expect(panel).toHaveCount(1)
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute("data-source", "not_connected")
  await expect(panel).toHaveAccessibleName(`${GMAIL_PANEL_TITLES[screen]}: not connected`)
  await expect(panel.getByTestId("not-connected")).toHaveText("Not connected")
  await expect(panel.getByText(GMAIL_PANEL_TITLES[screen], { exact: true })).toBeVisible()
  await expect(panel.getByText(GMAIL_HINT, { exact: true })).toBeVisible()
  return panel
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
 * (Gmail not connected), past the loading state: the note reads Saved.
 */
export async function openWithOwnContacts(page: Page, path: string, contacts: readonly OwnContact[] = OWN_CONTACTS) {
  await page.goto(path)
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [CRM_STORAGE_KEY, JSON.stringify(ownCrmState(contacts))] as const
  )
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.saved)
}
