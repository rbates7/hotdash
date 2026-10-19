import { describe, expect, it } from "vitest"

import { listTriageThreads } from "@/lib/crm/crm"
import {
  createIdRegistry,
  decodeEntities,
  mapGmailThreads,
  parseAddressList,
  skipReason,
  type GmailThreadMeta,
} from "@/lib/crm/gmail-mapping"
import { isCrmLiveData } from "@/lib/crm/gmail-summary"
import { gmailFixtureThreads } from "@/test/gmail-fixture"

const NOW = Date.parse("2026-10-14T17:00:00.000Z")
const MAILBOX = "info@chlkapp.com"
const HOUR = 3_600_000

const map = (threads: GmailThreadMeta[] = gmailFixtureThreads(NOW)) => mapGmailThreads(threads, { mailbox: MAILBOX })

describe("parseAddressList", () => {
  it("reads names, quotes and bare addresses, lower-cases, and drops anything malformed", () => {
    expect(parseAddressList('"Ortiz, Dana" <DOrtiz@Lakeview.org>, sam@x.io, not an address, <bad@>')).toEqual([
      { email: "dortiz@lakeview.org", name: "Ortiz, Dana" },
      { email: "sam@x.io", name: null },
    ])
    expect(parseAddressList("jo@x.io <jo@x.io>")).toEqual([{ email: "jo@x.io", name: null }])
    expect(parseAddressList(null)).toEqual([])
  })
})

describe("decodeEntities", () => {
  it("decodes Gmail's escaped snippets, and leaves unknown entities alone", () => {
    expect(decodeEntities("it&#39;s &amp; &lt;b&gt; &quot;x&quot; &#x2014; &bogus;")).toBe('it\'s & <b> "x" — &bogus;')
  })
})

describe("mapGmailThreads", () => {
  it("produces rows every CRM guard accepts", () => {
    expect(isCrmLiveData(map())).toBe(true)
  })

  it("a thread the inbox replied in is a case, and so is the same sender's next thread", () => {
    const { cases, contacts } = map()
    const byNumber = Object.fromEntries(cases.map((c) => [c.caseNumber, c]))
    // Numbered oldest first across every thread (triage threads too).
    expect(cases.map((c) => c.caseNumber)).toEqual([1, 3, 6, 7])
    expect(byNumber[1]).toMatchObject({ subject: "Refund for a duplicate charge", status: "closed", priority: "normal" })
    expect(byNumber[1]!.closedAt).toBe(byNumber[1]!.lastActivityAt)
    expect(byNumber[3]).toMatchObject({ subject: "Annual invoice for Summit Prep", status: "waiting", closedAt: null })
    expect(byNumber[6]).toMatchObject({ subject: "Can assistants share one playbook?", status: "new" })
    expect(byNumber[7]).toMatchObject({
      subject: "Roster import fails on a CSV with accents",
      status: "open",
      priority: "high",
      lastInboundAt: new Date(NOW - 40 * 60_000).toISOString(),
      lastOutboundAt: new Date(NOW - 2 * HOUR).toISOString(),
      createdAt: new Date(NOW - 3 * HOUR).toISOString(),
    })
    const dana = contacts.find((c) => c.email === "dortiz@lakeviewfootball.org")!
    expect(byNumber[6]!.contactId).toBe(dana.id)
    expect(byNumber[7]!.contactId).toBe(dana.id)
  })

  it("contacts come from Gmail, with an organization by domain (none for a free-mail address)", () => {
    const { contacts, organizations } = map()
    expect(contacts.map((c) => c.email)).toEqual([
      "ben.carter@gmail.com",
      "knguyen@summitprep.edu",
      "dortiz@lakeviewfootball.org",
    ])
    expect(contacts[0]).toMatchObject({ firstName: "Ben", lastName: "Carter", nameSource: "gmail", source: "gmail", organizationId: null, plan: null })
    expect(organizations).toEqual([
      { id: "org-1", name: "summitprep.edu", domain: "summitprep.edu" },
      { id: "org-2", name: "lakeviewfootball.org", domain: "lakeviewfootball.org" },
    ])
    expect(contacts[1]!.organizationId).toBe("org-1")
  })

  it("unknown senders are triage: pending in the inbox, ignored once archived", () => {
    const { messages } = map()
    const triage = listTriageThreads(messages)
    expect(triage.map((t) => [t.senderEmail, t.messageCount])).toEqual([
      ["sam@ridgecrestathletics.com", 1],
      ["jlee@northfieldhs.org", 2],
    ])
    const vendor = messages.filter((m) => m.fromEmail === "news@vendor.example")
    expect(vendor.map((m) => [m.caseId, m.triageState])).toEqual([[null, "ignored"]])
  })

  it("messages: direction, decoded snippet as the text, no drafts, no bodies or attachments", () => {
    const { messages } = map()
    expect(messages).toHaveLength(12)
    expect(messages.some((m) => m.snippet.startsWith("Draft"))).toBe(false)
    const reply = messages.find((m) => m.snippet.startsWith("Thanks Dana"))!
    expect(reply).toMatchObject({
      direction: "outbound",
      fromEmail: MAILBOX,
      toEmails: ["dortiz@lakeviewfootball.org"],
      bodyText: "Thanks Dana — can you send the file? We'll look today.",
      bodyHtml: null,
      attachments: [],
    })
    expect(messages.find((m) => m.snippet.startsWith("Attached"))!.snippet).toContain("iPad app & the web")
  })

  it("keeps a thread's numbers from one sync to the next with a shared registry", () => {
    const ids = createIdRegistry()
    const threads = gmailFixtureThreads(NOW)
    const first = mapGmailThreads(threads, { mailbox: MAILBOX, ids })
    // The oldest thread falls out of the window; a new one arrives.
    const next = [
      ...threads.filter((t) => t.id !== "18f0a1b2c3d4e5f4"),
      {
        id: "18f0a1b2c3d4e5f8",
        messages: [
          {
            id: "m-new",
            labelIds: ["INBOX"],
            internalDate: String(NOW),
            snippet: "One more thing",
            headers: { from: "knguyen@summitprep.edu", to: MAILBOX, subject: "W-9 please" },
          },
        ],
      },
    ]
    const second = mapGmailThreads(next, { mailbox: MAILBOX, ids })
    const subjectOf = (data: typeof first, n: number) => data.cases.find((c) => c.caseNumber === n)?.subject
    for (const n of [3, 6, 7]) expect(subjectOf(second, n)).toBe(subjectOf(first, n))
    expect(subjectOf(second, 8)).toBe("W-9 please")
    expect(second.contacts.find((c) => c.email === "dortiz@lakeviewfootball.org")!.id).toBe(
      first.contacts.find((c) => c.email === "dortiz@lakeviewfootball.org")!.id
    )
  })

  it("clamps long fields to the CRM's limits and skips messages it cannot place", () => {
    const long = "x".repeat(400)
    const data = map([
      {
        id: "abc",
        messages: [
          { id: "1", labelIds: ["INBOX"], internalDate: String(NOW), snippet: long, headers: { from: `"${long}" <a@b.co>`, to: MAILBOX, subject: long } },
          { id: "2", labelIds: ["INBOX"], internalDate: "not a date", snippet: "", headers: { from: "c@d.co", to: MAILBOX, subject: "x" } },
          { id: "3", labelIds: ["INBOX"], internalDate: String(NOW), snippet: "", headers: { from: "garbage", to: MAILBOX, subject: "x" } },
        ],
      },
      { id: "def", messages: [] },
    ])
    expect(isCrmLiveData(data)).toBe(true)
    expect(data.messages).toHaveLength(1)
    expect(data.messages[0]!.snippet).toHaveLength(240)
    expect(data.messages[0]!.subject).toHaveLength(160)
    expect(data.messages[0]!.fromName).toHaveLength(60)
  })

  it("nothing to read is empty, not an error", () => {
    expect(map([])).toEqual({ organizations: [], contacts: [], cases: [], messages: [] })
  })
})

/* Synthetic only: invented people at example domains, never real mail. */
let seq = 0
function msg(from: string, subject: string, snippet: string, at: number, labels: string[] = ["INBOX"]) {
  seq += 1
  return { id: `m${seq}`, labelIds: labels, internalDate: String(at), snippet, headers: { from, to: null, subject } }
}
const thread = (id: string, ...messages: ReturnType<typeof msg>[]): GmailThreadMeta => ({ id, messages })
const CUSTOMER = '"Testy McTest" <testy@example.org>'
const ME = `Chlk <${MAILBOX}>`
const SENT = ["SENT"]

/** A real conversation, kept beside each filtered thread to show only that one goes. */
const KEPT = thread(
  "kept",
  msg(CUSTOMER, "Question about drills", "Can I share a drill?", NOW - 3 * HOUR),
  msg(ME, "Re: Question about drills", "Yes, from the menu.", NOW - 2 * HOUR, SENT)
)

/** Every string the CRM shows, so a dropped thread's words can be looked for anywhere. */
const everything = (threads: GmailThreadMeta[]) => JSON.stringify(map(threads))

describe("filters: not every thread is a conversation", () => {
  it("drops bounces and delivery failures (mailer-daemon, postmaster, Mail Delivery Subsystem, Undeliverable)", () => {
    const bounces = [
      thread(
        "b1",
        msg(ME, "Welcome aboard", "Hi Bouncy, welcome", NOW - 5 * HOUR, SENT),
        msg('"Mail Delivery Subsystem" <mailer-daemon@googlemail.com>', "Delivery Status Notification (Failure)", "Address not found", NOW - 4 * HOUR)
      ),
      thread("b2", msg("postmaster@example.net", "Undeliverable: Welcome aboard", "Your message to bouncy@example.net couldn't be delivered", NOW - 4 * HOUR)),
      thread("b3", msg('"Mail Delivery System" <relay@example.net>', "Returned mail: see transcript", "The original message was received", NOW - 4 * HOUR)),
      thread("b4", msg("someone@example.net", "Address not found", "Your message wasn't delivered to bouncy@example.net", NOW - 4 * HOUR)),
    ]
    for (const b of bounces) expect(skipReason(b, MAILBOX)).toBe("bounce")
    const out = map([KEPT, ...bounces])
    expect(out.contacts.map((c) => c.email)).toEqual(["testy@example.org"])
    expect(out.messages.every((m) => m.threadId === out.messages[0]!.threadId)).toBe(true)
    expect(everything([KEPT, ...bounces])).not.toMatch(/bouncy|mailer-daemon|postmaster|Delivery/i)
  })

  it("drops billing and failed-payment notices, and the customer's name in them appears nowhere", () => {
    const billing = [
      // Sent by the app from the support address: a failed charge, a renewal, a trial ending.
      thread("p1", msg(ME, "CHLK", "Hey Payton, We weren&#39;t able to charge your card for CHLK.", NOW - 6 * HOUR, SENT)),
      thread("p2", msg(ME, "Your Monthly Subscription to CHLK", "Hey Payton, your monthly subscription renewed.", NOW - 6 * HOUR, SENT)),
      thread("p3", msg(ME, "CHLK", "Hey Payton, Your free trial of Monthly Subscription ends soon.", NOW - 6 * HOUR, SENT)),
      // ...and one the customer answered: still a billing notice, dropped with the reply.
      thread(
        "p4",
        msg(ME, "Payment failed", "Hey Payton, your payment failed. Update your card.", NOW - 6 * HOUR, SENT),
        msg('"Payton Placeholder" <payton@example.com>', "Re: Payment failed", "Done, try again", NOW - 5 * HOUR)
      ),
      // From a billing sender.
      thread("p5", msg('"Stripe" <notifications@stripe.com>', "Payment from Payton Placeholder failed", "A payment of $9.99 failed", NOW - 6 * HOUR)),
      thread("p6", msg("billing@example-saas.com", "Your invoice", "Invoice for Payton Placeholder", NOW - 6 * HOUR)),
    ]
    for (const b of billing) expect(skipReason(b, MAILBOX)).toBe("billing")
    const out = map([KEPT, ...billing])
    expect(out.cases).toHaveLength(1)
    expect(out.contacts.map((c) => c.email)).toEqual(["testy@example.org"])
    expect(everything([KEPT, ...billing])).not.toMatch(/payton|stripe|charge|subscription|trial|invoice/i)
  })

  it("keeps a customer's own billing question, and the mailbox's human reply to it", () => {
    const question = thread(
      "q1",
      msg(CUSTOMER, "Billing question", "Why was I charged twice?", NOW - 3 * HOUR),
      msg(ME, "Re: Billing question", "Sorry! We weren't able to charge only once; I've refunded your invoice.", NOW - 2 * HOUR, SENT)
    )
    expect(skipReason(question, MAILBOX)).toBeNull()
    expect(map([question]).cases.map((c) => c.subject)).toEqual(["Billing question"])
  })

  it("drops outbound-only threads (the mailbox wrote, no customer replied)", () => {
    const outbound = [
      thread("o1", msg(ME, "Welcome to CHLK", "Hi Olive, here's how to start", NOW - 6 * HOUR, SENT)),
      thread(
        "o2",
        msg(ME, "Following up", "Hi Olive, checking in", NOW - 6 * HOUR, SENT),
        msg(ME, "Re: Following up", "Hi Olive, one more nudge", NOW - 5 * HOUR, SENT)
      ),
    ]
    for (const o of outbound) expect(skipReason(o, MAILBOX)).toBe("outbound_only")
    // A draft is not a reply.
    expect(skipReason(thread("o3", msg(ME, "Hello", "Hi", NOW - HOUR, SENT), msg(CUSTOMER, "Re: Hello", "draft", NOW, ["DRAFT"])), MAILBOX)).toBe(
      "outbound_only"
    )
    const out = map([KEPT, ...outbound])
    expect(out.cases.map((c) => c.subject)).toEqual(["Question about drills"])
    expect(everything([KEPT, ...outbound])).not.toMatch(/olive/i)
    // Once the customer answers, the thread the mailbox started is a case.
    const answered = thread(
      "o4",
      msg(ME, "Welcome to CHLK", "Hi Testy, here's how to start", NOW - 6 * HOUR, SENT),
      msg(CUSTOMER, "Re: Welcome to CHLK", "Thanks!", NOW - 5 * HOUR)
    )
    expect(skipReason(answered, MAILBOX)).toBeNull()
    expect(map([answered]).cases.map((c) => c.subject)).toEqual(["Welcome to CHLK"])
  })

  it("the fixture inbox loses nothing: every thread in it is a conversation", () => {
    for (const t of gmailFixtureThreads(NOW)) expect(skipReason(t, MAILBOX)).toBeNull()
  })
})
