import { mapGmailThreads, type GmailMessageMeta, type GmailThreadMeta } from "@/lib/crm/gmail-mapping"
import { DEFAULT_MAILBOX, type LiveGmailSummary } from "@/lib/crm/gmail-summary"

/**
 * Support-inbox threads for tests and e2e mocks — pure data, no React, so
 * the Playwright specs can import it too. Invented people and schools,
 * never real mail. Dated back from `nowMs` so "2h ago" stays true.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

type Seed = {
  ago: number
  from: string
  to: string
  subject: string
  snippet: string
  labels: string[]
}

const ME = `Chlk Support <${DEFAULT_MAILBOX}>`

const THREADS: Array<{ id: string; messages: Seed[] }> = [
  {
    // Replied, then the coach wrote back: open; starred: high.
    id: "18f0a1b2c3d4e5f1",
    messages: [
      { ago: 3 * HOUR, from: '"Dana Ortiz" <dortiz@lakeviewfootball.org>', to: ME, subject: "Roster import fails on a CSV with accents", snippet: "Hi! The roster import stops at row 12 — it&#39;s the first name with an accent (José).", labels: ["INBOX", "STARRED"] },
      { ago: 2 * HOUR, from: ME, to: "Dana Ortiz <dortiz@lakeviewfootball.org>", subject: "Re: Roster import fails on a CSV with accents", snippet: "Thanks Dana — can you send the file? We&#39;ll look today.", labels: ["SENT"] },
      { ago: 40 * MIN, from: "Dana Ortiz <dortiz@lakeviewfootball.org>", to: ME, subject: "Re: Roster import fails on a CSV with accents", snippet: "Attached. Same thing happens on the iPad app &amp; the web.", labels: ["INBOX", "UNREAD"] },
    ],
  },
  {
    // Replied, nothing back yet: waiting. The draft is never read.
    id: "18f0a1b2c3d4e5f2",
    messages: [
      { ago: 2 * DAY, from: "Kelly Nguyen <knguyen@summitprep.edu>", to: ME, subject: "Annual invoice for Summit Prep", snippet: "Could you resend the Annual invoice with our PO number on it?", labels: ["INBOX"] },
      { ago: 1 * DAY, from: ME, to: "knguyen@summitprep.edu", subject: "Re: Annual invoice for Summit Prep", snippet: "Here you go — PO 4471 is on the new copy.", labels: ["SENT", "INBOX"] },
      { ago: 20 * HOUR, from: ME, to: "knguyen@summitprep.edu", subject: "Re: Annual invoice for Summit Prep", snippet: "Draft: following up", labels: ["DRAFT"] },
    ],
  },
  {
    // A known sender's new thread: a case straight away, new.
    id: "18f0a1b2c3d4e5f3",
    messages: [
      { ago: 5 * HOUR, from: "Dana Ortiz <dortiz@lakeviewfootball.org>", to: ME, subject: "Can assistants share one playbook?", snippet: "Our two assistants want to edit the same playbook. Is that a Staff seat each?", labels: ["INBOX", "UNREAD"] },
    ],
  },
  {
    // Replied and archived: closed. gmail.com: no organization.
    id: "18f0a1b2c3d4e5f4",
    messages: [
      { ago: 9 * DAY, from: '"Ben Carter" <ben.carter@gmail.com>', to: ME, subject: "Refund for a duplicate charge", snippet: "I was charged twice for Monthly this morning.", labels: [] },
      { ago: 8 * DAY, from: ME, to: "ben.carter@gmail.com", subject: "Re: Refund for a duplicate charge", snippet: "Refunded the second charge — sorry about that, Ben.", labels: ["SENT"] },
    ],
  },
  {
    // Unknown sender, in the inbox: triage.
    id: "18f0a1b2c3d4e5f5",
    messages: [
      { ago: 6 * HOUR, from: "Sam Patel <sam@ridgecrestathletics.com>", to: ME, subject: "Pricing for a district license", snippet: "We have nine schools in the district. Is there a district price?", labels: ["INBOX", "UNREAD"] },
    ],
  },
  {
    // Unknown sender, two messages: one triage card.
    id: "18f0a1b2c3d4e5f6",
    messages: [
      { ago: 1 * DAY, from: "Jordan Lee <jlee@northfieldhs.org>", to: ME, subject: "Do you integrate with Hudl?", snippet: "Our film is all in Hudl — can Chlk pull clips from it?", labels: ["INBOX"] },
      { ago: 20 * HOUR, from: "Jordan Lee <jlee@northfieldhs.org>", to: ME, subject: "Re: Do you integrate with Hudl?", snippet: "Bumping this one before our staff meeting.", labels: ["INBOX", "UNREAD"] },
    ],
  },
  {
    // Unknown sender, archived without a reply: ignored, off the triage list.
    id: "18f0a1b2c3d4e5f7",
    messages: [
      { ago: 3 * DAY, from: "Vendor News <news@vendor.example>", to: ME, subject: "October product digest", snippet: "This month in vendor news…", labels: [] },
    ],
  },
]

/** The mailbox's threads as Gmail's metadata answer would carry them. */
export function gmailFixtureThreads(nowMs: number): GmailThreadMeta[] {
  return THREADS.map((t) => ({
    id: t.id,
    messages: t.messages.map(
      (m, i): GmailMessageMeta => ({
        id: `${t.id.slice(0, 12)}${String(i).padStart(4, "0")}`,
        labelIds: m.labels,
        internalDate: String(nowMs - m.ago),
        snippet: m.snippet,
        headers: { from: m.from, to: m.to, subject: m.subject },
      })
    ),
  }))
}

/** Raw `threads.get` bodies (format=metadata) for the loader's tests. */
export function gmailApiThread(thread: GmailThreadMeta) {
  return {
    id: thread.id,
    historyId: "9001",
    messages: thread.messages.map((m) => ({
      id: m.id,
      threadId: thread.id,
      labelIds: m.labelIds,
      snippet: m.snippet,
      internalDate: m.internalDate,
      sizeEstimate: 1234,
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: m.headers.from },
          { name: "To", value: m.headers.to },
          { name: "Subject", value: m.headers.subject },
        ],
      },
    })),
  }
}

/** A connected (or stale) `/api/crm/gmail` body, synced a minute before `nowMs`. */
export function liveGmailSummary(nowMs: number, status: "connected" | "stale" = "connected"): LiveGmailSummary {
  return {
    status,
    lastSyncedAt: new Date(nowMs - MIN).toISOString(),
    mailbox: DEFAULT_MAILBOX,
    data: mapGmailThreads(gmailFixtureThreads(nowMs), { mailbox: DEFAULT_MAILBOX }),
  }
}
