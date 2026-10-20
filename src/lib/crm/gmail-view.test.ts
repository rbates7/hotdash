import { describe, expect, it } from "vitest"

import type { GmailThreadMeta } from "@/lib/crm/gmail-mapping"
import { buildCrmList, htmlToText, parseFullThread } from "@/lib/crm/gmail-view"

const ME = "support@example.com"
const NOW = Date.parse("2026-10-20T12:00:00.000Z")
const H = 3_600_000
const msg = (id: string, ago: number, from: string, to: string, labels: string[], snippet = "hi") => ({
  id,
  labelIds: labels,
  internalDate: String(NOW - ago),
  snippet,
  headers: { from, to, subject: "Help" },
})

const THREADS: GmailThreadMeta[] = [
  // Coach wrote last after our reply; starred, waiting 30h: urgent.
  {
    id: "a1",
    messages: [
      msg("1", 40 * H, "Ana Ruiz <ana@school.example.com>", ME, ["INBOX"]),
      msg("2", 35 * H, ME, "ana@school.example.com", ["SENT"]),
      msg("3", 30 * H, "Ana Ruiz <ana@school.example.com>", ME, ["INBOX", "STARRED", "UNREAD"], "still broken &amp; slow"),
    ],
  },
  // We replied last: waiting on them.
  {
    id: "a2",
    messages: [
      msg("4", 10 * H, "Bo Lee <bo@school.example.com>", ME, ["INBOX"]),
      msg("5", 9 * H, ME, "bo@school.example.com", ["SENT", "INBOX"]),
    ],
  },
  // Archived after the customer wrote: closed, this week. Personal domain: no account.
  {
    id: "a3",
    // gmail.com on purpose: it exercises the personal-domain rule (crm.ts lists gmail/yahoo/outlook literally), so the account must be null. Never sent anywhere.
    messages: [msg("6", 50 * H, "cy@gmail.com", ME, []), msg("7", 49 * H, ME, "cy@gmail.com", ["SENT"])],
  },
  // Unanswered first contact: triage, not a case.
  { id: "a4", messages: [msg("8", 1 * H, "new@example.com", ME, ["INBOX", "UNREAD"])] },
]

describe("buildCrmList", () => {
  const view = buildCrmList(THREADS, { mailbox: ME, nowMs: NOW })
  const byThreadSubject = (email: string) => view.cases.find((c) => c.contact.email === email)!

  it("derives status, waitingOnUsSince, priority, unread and labels", () => {
    const ana = byThreadSubject("ana@school.example.com")
    expect(ana.status).toBe("waiting_on_us")
    expect(ana.waitingOnUsSince).toBe(new Date(NOW - 30 * H).toISOString())
    expect(ana.priority).toBe("urgent")
    expect(ana.unread).toBe(true)
    expect(ana.labels).toEqual(["inbox", "sent", "starred", "unread"])
    expect(ana.lastMessageSnippet).toBe("still broken & slow")
    expect(ana.messageCount).toBe(3)
    expect(ana.contact).toEqual({ name: "Ana Ruiz", email: "ana@school.example.com" })

    const bo = byThreadSubject("bo@school.example.com")
    expect(bo).toMatchObject({ status: "waiting_on_them", priority: "normal", waitingOnUsSince: null, unread: false })

    const cy = byThreadSubject("cy@gmail.com")
    expect(cy).toMatchObject({ status: "closed", accountId: null, contact: { name: null, email: "cy@gmail.com" } })
  })

  it("leaves triage out and counts the rest", () => {
    expect(view.cases).toHaveLength(3)
    expect(view.counts).toEqual({ open: 2, waitingOnUs: 1, waitingOnThem: 1, closedThisWeek: 1 })
  })

  it("groups accounts by domain", () => {
    expect(view.accounts).toHaveLength(1)
    expect(view.accounts[0]).toMatchObject({ name: "school.example.com", domain: "school.example.com", openCases: 2, waitingOnUsCount: 1 })
    expect(view.accounts[0]!.contacts.map((c) => c.email).sort()).toEqual(["ana@school.example.com", "bo@school.example.com"])
    expect(view.cases.filter((c) => c.accountId === view.accounts[0]!.id)).toHaveLength(2)
  })

  it("lists received/sent activity newest first, never status_changed", () => {
    expect(view.recentActivity[0]).toMatchObject({ type: "sent", actor: { email: ME } })
    expect(view.recentActivity.map((a) => a.type)).not.toContain("status_changed")
    expect(view.recentActivity).toHaveLength(7)
    const ats = view.recentActivity.map((a) => a.at)
    expect([...ats].sort().reverse()).toEqual(ats)
  })

  it("starred but answered is high, not urgent", () => {
    const t: GmailThreadMeta[] = [
      { id: "b1", messages: [msg("1", 5 * H, "d@example.com", ME, ["INBOX", "STARRED"]), msg("2", 4 * H, ME, "d@example.com", ["SENT"])] },
    ]
    expect(buildCrmList(t, { mailbox: ME, nowMs: NOW }).cases[0]!.priority).toBe("high")
  })
})

const b64 = (s: string) => Buffer.from(s).toString("base64url")

describe("parseFullThread", () => {
  const raw = {
    messages: [
      {
        labelIds: ["SENT"],
        internalDate: String(NOW - H),
        payload: {
          mimeType: "text/html",
          headers: [{ name: "From", value: ME }, { name: "To", value: "ana@example.com" }],
          body: { data: b64("<p>Thanks&nbsp;Ana</p><script>x()</script>") },
        },
      },
      {
        labelIds: ["INBOX"],
        internalDate: String(NOW - 2 * H),
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "From", value: "Ana <ana@example.com>" },
            { name: "To", value: ME },
            { name: "Cc", value: "Bo <bo@example.com>" },
          ],
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                { mimeType: "text/plain", body: { data: b64("Plain body") } },
                { mimeType: "text/html", body: { data: b64("<b>Html body</b>") } },
              ],
            },
            { mimeType: "image/png", filename: "shot.png", body: { attachmentId: "x", size: 2048 } },
          ],
        },
      },
      { labelIds: ["DRAFT"], internalDate: String(NOW), payload: {} },
    ],
  }
  const messages = parseFullThread(raw, { mailbox: ME, threadId: "thread-7" })

  it("orders oldest first, skips drafts, numbers ids", () => {
    expect(messages.map((m) => m.id)).toEqual(["thread-7-m1", "thread-7-m2"])
    expect(messages.map((m) => m.direction)).toEqual(["inbound", "outbound"])
  })

  it("reads plain and HTML parts, cc, and attachment metadata only", () => {
    expect(messages[0]).toMatchObject({
      from: { name: "Ana", email: "ana@example.com" },
      cc: [{ name: "Bo", email: "bo@example.com" }],
      bodyText: "Plain body",
      attachments: [{ name: "shot.png", size: 2048, mimeType: "image/png" }],
    })
  })

  it("falls back to the HTML as text, without scripts", () => {
    expect(messages[1]!.bodyText).toBe("Thanks Ana")
  })

  it("never returns HTML: no bodyHtml key and no tags in bodyText, even for hostile mail", () => {
    const hostile = [
      '<p>Hi<script>alert(1)</script></p><img src="https://evil.example.com/t.gif" onerror="alert(2)">',
      '<a href="javascript:alert(3)">click</a> <img src=x onerror=alert(4)>',
      "<style>p{}</style><!-- c --><iframe src='https://evil.example.com'></iframe>&lt;script&gt;x&lt;/script&gt;",
    ]
    const b64 = (s: string) => Buffer.from(s).toString("base64url")
    const thread = {
      messages: hostile.map((h, i) => ({
        labelIds: ["INBOX"],
        internalDate: String(NOW - (10 - i) * 1000),
        payload: { mimeType: "text/html", headers: [{ name: "From", value: "x@example.com" }], body: { data: b64(h) } },
      })),
    }
    const plainScript = {
      messages: [{
        labelIds: ["INBOX"],
        internalDate: String(NOW),
        payload: { mimeType: "text/plain", headers: [{ name: "From", value: "x@example.com" }], body: { data: b64("ok <script>alert(5)</script>") } },
      }],
    }
    const all = [
      ...parseFullThread(thread, { mailbox: ME, threadId: "thread-9" }),
      ...parseFullThread(plainScript, { mailbox: ME, threadId: "thread-9" }),
    ]
    expect(all).toHaveLength(4)
    for (const m of all) {
      expect(Object.keys(m)).not.toContain("bodyHtml")
      expect(m.bodyText).not.toMatch(/<[a-z!/]/i)
      expect(m.bodyText).not.toMatch(/onerror|javascript:|evil\.example|alert\(/i)
    }
    expect(all[0]!.bodyText).toBe("Hi")
    expect(all[1]!.bodyText).toBe("click")
  })

  it("is empty for junk", () => {
    expect(parseFullThread(null, { mailbox: ME, threadId: "thread-1" })).toEqual([])
  })

  it("htmlToText breaks lines on blocks", () => {
    expect(htmlToText("<div>a</div><div>b<br>c</div>")).toBe("a\nb\nc")
  })
})
