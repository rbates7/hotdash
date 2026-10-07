import type {
  Case,
  CasePriority,
  CaseStatus,
  Contact,
  EmailMessage,
  Note,
  Organization,
} from "@/lib/crm/crm"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const at = (nowMs: number, offsetMs: number) => new Date(nowMs - offsetMs).toISOString()

/**
 * Seed dated from the request instant so "2h ago" and "5 days ago" stay
 * true no matter when the page is opened. The discovery app's sample
 * customers, cases, notes and triage threads.
 */
export function seedOrganizations(nowMs: number): Organization[] {
  void nowMs
  return [
    { id: "org-1", name: "Acme Robotics", domain: "acme.com" },
    { id: "org-2", name: "Birchwood Labs", domain: "birchwood.io" },
    { id: "org-3", name: "Sunrise Media", domain: "sunrisemedia.co" },
  ]
}

export function seedContacts(nowMs: number): Contact[] {
  return [
    {
      id: "contact-1",
      email: "dana@acme.com",
      firstName: "Dana",
      lastName: "Whitfield",
      nameSource: "supabase",
      organizationId: "org-1",
      plan: "Growth",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 90 * DAY),
    },
    {
      id: "contact-2",
      email: "marcus@acme.com",
      firstName: "Marcus",
      lastName: "Lee",
      nameSource: "supabase",
      organizationId: "org-1",
      plan: "Growth",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 88 * DAY),
    },
    {
      id: "contact-3",
      email: "priya@birchwood.io",
      firstName: "Priya",
      lastName: "Raman",
      nameSource: "supabase",
      organizationId: "org-2",
      plan: "Starter",
      planStatus: "trialing",
      source: "stripe",
      createdAt: at(nowMs, 60 * DAY),
    },
    {
      id: "contact-4",
      email: "jonah@sunrisemedia.co",
      firstName: "Jonah",
      lastName: "Beck",
      nameSource: "stripe",
      organizationId: "org-3",
      plan: "Pro",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 45 * DAY),
    },
    {
      id: "contact-5",
      email: "elena@sunrisemedia.co",
      firstName: "Elena",
      lastName: "Souza",
      nameSource: "supabase",
      organizationId: "org-3",
      plan: "Pro",
      planStatus: "canceled",
      source: "stripe",
      createdAt: at(nowMs, 44 * DAY),
    },
    {
      id: "contact-6",
      email: "tom.alvarez@gmail.com",
      firstName: "Tom",
      lastName: "Alvarez",
      nameSource: "gmail",
      organizationId: null,
      plan: "Starter",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 30 * DAY),
    },
  ]
}

type CaseSeed = {
  id: string
  n: number
  subject: string
  status: CaseStatus
  priority: CasePriority
  contactId: string
  lastActivity: number
  lastInbound?: number
  lastOutbound?: number
  closed?: number
  created: number
}

const CASE_SEEDS: CaseSeed[] = [
  {
    id: "case-1",
    n: 1,
    subject: "Can't invite teammates to workspace",
    status: "open",
    priority: "high",
    contactId: "contact-1",
    lastActivity: 2 * HOUR,
    lastInbound: 2 * HOUR,
    lastOutbound: 5 * HOUR,
    created: 1 * DAY,
  },
  {
    id: "case-2",
    n: 2,
    subject: "Billing question about seats",
    status: "closed",
    priority: "normal",
    contactId: "contact-1",
    lastActivity: 20 * DAY,
    lastInbound: 20 * DAY,
    lastOutbound: 20 * DAY - 2 * HOUR,
    closed: 19 * DAY,
    created: 24 * DAY,
  },
  {
    id: "case-3",
    n: 3,
    subject: "CSV export times out on large ranges",
    status: "waiting",
    priority: "normal",
    contactId: "contact-2",
    lastActivity: 1 * DAY,
    lastOutbound: 1 * DAY,
    lastInbound: 2 * DAY,
    created: 3 * DAY,
  },
  {
    id: "case-4",
    n: 4,
    subject: "Onboarding checklist stuck at step 3",
    status: "new",
    priority: "normal",
    contactId: "contact-3",
    lastActivity: 3 * HOUR,
    lastInbound: 3 * HOUR,
    created: 3 * HOUR,
  },
  {
    id: "case-5",
    n: 5,
    subject: "API rate limits for reporting integration",
    status: "open",
    priority: "urgent",
    contactId: "contact-4",
    lastActivity: 5 * DAY,
    lastInbound: 5 * DAY,
    lastOutbound: 6 * DAY,
    created: 8 * DAY,
  },
  {
    id: "case-6",
    n: 6,
    subject: "Cancel subscription and export data",
    status: "closed",
    priority: "low",
    contactId: "contact-5",
    lastActivity: 30 * DAY,
    lastInbound: 30 * DAY,
    closed: 29 * DAY,
    created: 31 * DAY,
  },
  {
    id: "case-7",
    n: 7,
    subject: "Login loop on Safari 18",
    status: "open",
    priority: "normal",
    contactId: "contact-6",
    lastActivity: 26 * HOUR,
    lastInbound: 26 * HOUR,
    created: 2 * DAY,
  },
  {
    id: "case-8",
    n: 8,
    subject: "Feature request: weekly digest email",
    status: "waiting",
    priority: "low",
    contactId: "contact-3",
    lastActivity: 4 * DAY,
    lastOutbound: 4 * DAY,
    lastInbound: 5 * DAY,
    created: 6 * DAY,
  },
]

export function seedCases(nowMs: number): Case[] {
  return CASE_SEEDS.map((c) => ({
    id: c.id,
    caseNumber: c.n,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    contactId: c.contactId,
    lastActivityAt: at(nowMs, c.lastActivity),
    lastInboundAt: c.lastInbound !== undefined ? at(nowMs, c.lastInbound) : null,
    lastOutboundAt: c.lastOutbound !== undefined ? at(nowMs, c.lastOutbound) : null,
    closedAt: c.closed !== undefined ? at(nowMs, c.closed) : null,
    createdAt: at(nowMs, c.created),
  }))
}

const FOUNDER = "rashad@chlk.xyz"

type MsgSeed = {
  id: string
  caseId: string | null
  triage?: "pending"
  thread: string
  dir: "inbound" | "outbound"
  from: string
  fromName?: string
  subject: string
  text: string
  html?: string
  sent: number
  attachments?: { filename: string; mimeType: string; size: number }[]
}

const MSG_SEEDS: MsgSeed[] = [
  {
    id: "message-1",
    caseId: "case-1",
    thread: "thread-1",
    dir: "inbound",
    from: "dana@acme.com",
    fromName: "Dana Whitfield",
    subject: "Can't invite teammates to workspace",
    text: "Hey — when I try to invite my teammates from the workspace settings page, the invite button spins forever and nothing sends. We're trying to onboard three new people this week. Can you take a look?",
    sent: 1 * DAY,
  },
  {
    id: "message-2",
    caseId: "case-1",
    thread: "thread-1",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Can't invite teammates to workspace",
    text: "Hi Dana, sorry about that! Quick question so I can dig in: are the teammates you're inviting on your acme.com domain, or external addresses? Also — roughly what time did you last try? I'll check the logs.",
    sent: 5 * HOUR,
  },
  {
    id: "message-3",
    caseId: "case-1",
    thread: "thread-1",
    dir: "inbound",
    from: "dana@acme.com",
    fromName: "Dana Whitfield",
    subject: "Re: Can't invite teammates to workspace",
    text: "All three are on acme.com. Last try was about 20 minutes before I emailed you. Attached a screenshot of the spinner.",
    sent: 2 * HOUR,
    attachments: [{ filename: "invite-spinner.png", mimeType: "image/png", size: 482133 }],
  },
  {
    id: "message-4",
    caseId: "case-2",
    thread: "thread-2",
    dir: "inbound",
    from: "dana@acme.com",
    fromName: "Dana Whitfield",
    subject: "Billing question about seats",
    text: "If we add two more seats mid-cycle, do we get charged prorated or full month?",
    sent: 20 * DAY,
  },
  {
    id: "message-5",
    caseId: "case-2",
    thread: "thread-2",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Billing question about seats",
    text: "Prorated automatically — you'll see the partial charge on the next invoice. Nothing you need to do.",
    sent: 20 * DAY - 2 * HOUR,
  },
  {
    id: "message-6",
    caseId: "case-3",
    thread: "thread-3",
    dir: "inbound",
    from: "marcus@acme.com",
    fromName: "Marcus Lee",
    subject: "CSV export times out on large ranges",
    text: "Exporting anything over ~90 days of data just hangs and eventually errors with a timeout. 30-day ranges work fine.",
    sent: 2 * DAY,
  },
  {
    id: "message-7",
    caseId: "case-3",
    thread: "thread-3",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: CSV export times out on large ranges",
    text: "Thanks Marcus — I can reproduce it. Working on chunking the export; will follow up when it's deployed. Should be a couple of days.",
    sent: 1 * DAY,
  },
  {
    id: "message-8",
    caseId: "case-4",
    thread: "thread-4",
    dir: "inbound",
    from: "priya@birchwood.io",
    fromName: "Priya Raman",
    subject: "Onboarding checklist stuck at step 3",
    text: "The 'connect your data source' step never completes even though the connection test passes. The checklist stays at step 3 of 5.",
    html: "<p>The <b>connect your data source</b> step never completes even though the connection test passes.</p><p>The checklist stays at step 3 of 5.</p>",
    sent: 3 * HOUR,
  },
  {
    id: "message-9",
    caseId: "case-5",
    thread: "thread-5",
    dir: "inbound",
    from: "jonah@sunrisemedia.co",
    fromName: "Jonah Beck",
    subject: "API rate limits for reporting integration",
    text: "We're hitting 429s pulling hourly metrics for our internal dashboard. What are the actual limits on the Pro plan, and can they be raised?",
    sent: 8 * DAY,
  },
  {
    id: "message-10",
    caseId: "case-5",
    thread: "thread-5",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: API rate limits for reporting integration",
    text: "Pro is 600 requests/min today. Tell me a bit about your pull pattern — if it's bursty we can probably fit you under a batched endpoint instead of raising the cap.",
    sent: 6 * DAY,
  },
  {
    id: "message-11",
    caseId: "case-5",
    thread: "thread-5",
    dir: "inbound",
    from: "jonah@sunrisemedia.co",
    fromName: "Jonah Beck",
    subject: "Re: API rate limits for reporting integration",
    text: "It's one big pull at the top of every hour — about 2,000 requests over 3 minutes. Batching sounds right, where do we start?",
    sent: 5 * DAY,
  },
  {
    id: "message-12",
    caseId: "case-6",
    thread: "thread-6",
    dir: "inbound",
    from: "elena@sunrisemedia.co",
    fromName: "Elena Souza",
    subject: "Cancel subscription and export data",
    text: "We're consolidating tools — please cancel our subscription at the end of the cycle. Also, how do I export all our historical data first?",
    sent: 30 * DAY,
  },
  {
    id: "message-13",
    caseId: "case-7",
    thread: "thread-7",
    dir: "inbound",
    from: "tom.alvarez@gmail.com",
    fromName: "Tom Alvarez",
    subject: "Login loop on Safari 18",
    text: "On Safari 18 I sign in, get redirected to the dashboard for a second, then bounced back to the login page. Chrome works fine.",
    sent: 26 * HOUR,
  },
  {
    id: "message-14",
    caseId: "case-8",
    thread: "thread-8",
    dir: "inbound",
    from: "priya@birchwood.io",
    fromName: "Priya Raman",
    subject: "Feature request: weekly digest email",
    text: "Would love a Monday-morning digest of the previous week's numbers so I don't have to log in for the basics.",
    sent: 5 * DAY,
  },
  {
    id: "message-15",
    caseId: "case-8",
    thread: "thread-8",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Feature request: weekly digest email",
    text: "Noted — it's on the shortlist. Curious: which 3 numbers would you want at the top of that email?",
    sent: 4 * DAY,
  },
  {
    id: "message-16",
    caseId: null,
    triage: "pending",
    thread: "thread-9",
    dir: "inbound",
    from: "lena@futurebridge.vc",
    fromName: "Lena Ortiz",
    subject: "Intro — Futurebridge <> Chlk",
    text: "Hi Rashad, I lead early-stage investments at Futurebridge. We've been following Chlk and would love to hear where you're headed. Open to a 30-minute call in the next couple of weeks?",
    sent: 3 * HOUR,
  },
  {
    id: "message-17",
    caseId: null,
    triage: "pending",
    thread: "thread-10",
    dir: "inbound",
    from: "alex@contractorplus.app",
    fromName: "Alex Kim",
    subject: "Integration question",
    text: "Hey — we build field-service software and a few shared customers asked about a Chlk integration. Is there a partner API or should we scrape the CSV exports?",
    sent: 22 * HOUR,
  },
  {
    id: "message-18",
    caseId: null,
    triage: "pending",
    thread: "thread-10",
    dir: "inbound",
    from: "alex@contractorplus.app",
    fromName: "Alex Kim",
    subject: "Re: Integration question",
    text: "Following up on the below — happy to sign an NDA if that helps.",
    sent: 4 * HOUR,
  },
]

export function seedMessages(nowMs: number): EmailMessage[] {
  return MSG_SEEDS.map((m) => ({
    id: m.id,
    threadId: m.thread,
    caseId: m.caseId,
    triageState: m.triage ?? null,
    direction: m.dir,
    fromEmail: m.from,
    fromName: m.fromName ?? null,
    toEmails: m.dir === "inbound" ? [FOUNDER] : [inboundFrom(m.thread)],
    subject: m.subject,
    snippet: m.text.slice(0, 120),
    bodyText: m.text,
    bodyHtml: m.html ?? null,
    attachments: m.attachments ?? [],
    sentAt: at(nowMs, m.sent),
  }))
}

function inboundFrom(thread: string) {
  return MSG_SEEDS.find((x) => x.thread === thread && x.dir === "inbound")?.from ?? FOUNDER
}

export function seedNotes(nowMs: number): Note[] {
  return [
    {
      id: "note-1",
      caseId: "case-1",
      kind: "user",
      body: "Reproduced on staging — invite POST 500s when the workspace has a pending invite for the same address.",
      createdAt: at(nowMs, 4 * HOUR),
    },
    {
      id: "note-2",
      caseId: "case-3",
      kind: "system",
      body: "Status changed to Waiting on customer",
      createdAt: at(nowMs, 1 * DAY),
    },
    {
      id: "note-3",
      caseId: "case-2",
      kind: "system",
      body: "Status changed to Closed",
      createdAt: at(nowMs, 19 * DAY),
    },
    {
      id: "note-4",
      caseId: "case-6",
      kind: "system",
      body: "Status changed to Closed",
      createdAt: at(nowMs, 29 * DAY),
    },
    {
      id: "note-5",
      caseId: "case-5",
      kind: "user",
      body: "Batched endpoint spec drafted — send to Jonah once reviewed.",
      createdAt: at(nowMs, 5 * DAY),
    },
  ]
}

export const SEED_CONTACT_IDS: ReadonlySet<string> = new Set(seedContacts(0).map((c) => c.id))
export const SEED_CASE_IDS: ReadonlySet<string> = new Set(seedCases(0).map((c) => c.id))
export const SEED_NOTE_IDS: ReadonlySet<string> = new Set(seedNotes(0).map((n) => n.id))

export function isSeedContact(id: string) {
  return SEED_CONTACT_IDS.has(id)
}

export function isSeedCase(id: string) {
  return SEED_CASE_IDS.has(id)
}

export function isSeedNote(id: string) {
  return SEED_NOTE_IDS.has(id)
}
