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
 * true no matter when the page is opened. Football coaches and schools on
 * Monthly / Annual / Staff — the help-desk sample Rashad confirmed.
 */
export function seedOrganizations(nowMs: number): Organization[] {
  void nowMs
  return [
    { id: "org-1", name: "Westfield HS", domain: "westfieldfb.org" },
    { id: "org-2", name: "Riverbend High", domain: "riverbendhs.org" },
    { id: "org-3", name: "Highland Athletics", domain: "highlandathletics.com" },
  ]
}

export function seedContacts(nowMs: number): Contact[] {
  return [
    {
      id: "contact-1",
      email: "mhale@westfieldfb.org",
      firstName: "Marcus",
      lastName: "Hale",
      nameSource: "supabase",
      organizationId: "org-1",
      plan: "Annual",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 90 * DAY),
    },
    {
      id: "contact-2",
      email: "jreeves@westfieldfb.org",
      firstName: "Jamal",
      lastName: "Reeves",
      nameSource: "supabase",
      organizationId: "org-1",
      plan: "Staff",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 88 * DAY),
    },
    {
      id: "contact-3",
      email: "priya.shah@riverbendhs.org",
      firstName: "Priya",
      lastName: "Shah",
      nameSource: "supabase",
      organizationId: "org-2",
      plan: "Monthly",
      planStatus: "trialing",
      source: "stripe",
      createdAt: at(nowMs, 60 * DAY),
    },
    {
      id: "contact-4",
      email: "cbrooks@highlandathletics.com",
      firstName: "Colin",
      lastName: "Brooks",
      nameSource: "stripe",
      organizationId: "org-3",
      plan: "Staff",
      planStatus: "active",
      source: "stripe",
      createdAt: at(nowMs, 45 * DAY),
    },
    {
      id: "contact-5",
      email: "elena.v@highlandathletics.com",
      firstName: "Elena",
      lastName: "Vasquez",
      nameSource: "supabase",
      organizationId: "org-3",
      plan: "Annual",
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
      plan: "Monthly",
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
    subject: "Staff seats invite fails on the iPad",
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
    subject: "Billing question about Annual seats",
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
    subject: "Playbook sync times out on a full install",
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
    subject: "Install / plays checklist stuck at step 3",
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
    subject: "Apple Pencil skips strokes in the play editor",
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
    subject: "Cancel Annual and export the playbook",
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
    subject: "iPad login loop after a forced update",
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
    subject: "Weekly install recap for the staff",
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
    from: "mhale@westfieldfb.org",
    fromName: "Marcus Hale",
    subject: "Staff seats invite fails on the iPad",
    text: "Hey — when I try to invite two assistant coaches to Staff seats from the iPad, the invite button spins forever and nothing sends. We need them in before Friday's install. Can you take a look?",
    sent: 1 * DAY,
  },
  {
    id: "message-2",
    caseId: "case-1",
    thread: "thread-1",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Staff seats invite fails on the iPad",
    text: "Hi Marcus, sorry about that. Quick question so I can dig in: are the assistants on westfieldfb.org, or personal addresses? Also — were you on the iPad app or Safari? I'll check the logs.",
    sent: 5 * HOUR,
  },
  {
    id: "message-3",
    caseId: "case-1",
    thread: "thread-1",
    dir: "inbound",
    from: "mhale@westfieldfb.org",
    fromName: "Marcus Hale",
    subject: "Re: Staff seats invite fails on the iPad",
    text: "Both are on westfieldfb.org. Last try was on the iPad app about 20 minutes before I emailed you. Attached a screenshot of the spinner.",
    sent: 2 * HOUR,
    attachments: [{ filename: "invite-spinner.png", mimeType: "image/png", size: 482133 }],
  },
  {
    id: "message-4",
    caseId: "case-2",
    thread: "thread-2",
    dir: "inbound",
    from: "mhale@westfieldfb.org",
    fromName: "Marcus Hale",
    subject: "Billing question about Annual seats",
    text: "If we add two more Staff seats mid-cycle on Annual, do we get charged prorated or the full year?",
    sent: 20 * DAY,
  },
  {
    id: "message-5",
    caseId: "case-2",
    thread: "thread-2",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Billing question about Annual seats",
    text: "Prorated automatically against the Annual — you'll see the partial charge on the next invoice. Nothing you need to do.",
    sent: 20 * DAY - 2 * HOUR,
  },
  {
    id: "message-6",
    caseId: "case-3",
    thread: "thread-3",
    dir: "inbound",
    from: "jreeves@westfieldfb.org",
    fromName: "Jamal Reeves",
    subject: "Playbook sync times out on a full install",
    text: "Pushing a full install to the staff iPads just hangs and eventually errors with a timeout. Syncing a single game's plays works fine.",
    sent: 2 * DAY,
  },
  {
    id: "message-7",
    caseId: "case-3",
    thread: "thread-3",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Playbook sync times out on a full install",
    text: "Thanks Jamal — I can reproduce it on a 400-play book. Working on chunking the sync; will follow up when it's on the iPads. Should be a couple of days.",
    sent: 1 * DAY,
  },
  {
    id: "message-8",
    caseId: "case-4",
    thread: "thread-4",
    dir: "inbound",
    from: "priya.shah@riverbendhs.org",
    fromName: "Priya Shah",
    subject: "Install / plays checklist stuck at step 3",
    text: "The 'load this week's plays' step never completes even though the playbook test passes. The install checklist stays at step 3 of 5.",
    html: "<p>The <b>load this week&apos;s plays</b> step never completes even though the playbook test passes.</p><p>The install checklist stays at step 3 of 5.</p>",
    sent: 3 * HOUR,
  },
  {
    id: "message-9",
    caseId: "case-5",
    thread: "thread-5",
    dir: "inbound",
    from: "cbrooks@highlandathletics.com",
    fromName: "Colin Brooks",
    subject: "Apple Pencil skips strokes in the play editor",
    text: "On the staff iPads the Apple Pencil skips strokes when we draw a route in the play editor. Finger drawing is fine. Happens on every iPad we tried.",
    sent: 8 * DAY,
  },
  {
    id: "message-10",
    caseId: "case-5",
    thread: "thread-5",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Apple Pencil skips strokes in the play editor",
    text: "Got it — likely the Pencil hover + our stroke coalescing. Can you send a 10-second clip from one of the Staff iPads? I'll match it against the play editor build.",
    sent: 6 * DAY,
  },
  {
    id: "message-11",
    caseId: "case-5",
    thread: "thread-5",
    dir: "inbound",
    from: "cbrooks@highlandathletics.com",
    fromName: "Colin Brooks",
    subject: "Re: Apple Pencil skips strokes in the play editor",
    text: "Clip's attached in the next email from our film guy. It's one long route at the start of install — about 8 seconds of skipped strokes.",
    sent: 5 * DAY,
  },
  {
    id: "message-12",
    caseId: "case-6",
    thread: "thread-6",
    dir: "inbound",
    from: "elena.v@highlandathletics.com",
    fromName: "Elena Vasquez",
    subject: "Cancel Annual and export the playbook",
    text: "We're consolidating tools — please cancel our Annual at the end of the cycle. Also, how do I export the playbook and install history first?",
    sent: 30 * DAY,
  },
  {
    id: "message-13",
    caseId: "case-7",
    thread: "thread-7",
    dir: "inbound",
    from: "tom.alvarez@gmail.com",
    fromName: "Tom Alvarez",
    subject: "iPad login loop after a forced update",
    text: "After last night's forced update I sign in on the iPad, see the playbook for a second, then bounce back to the login screen. The staff MacBooks are fine.",
    sent: 26 * HOUR,
  },
  {
    id: "message-14",
    caseId: "case-8",
    thread: "thread-8",
    dir: "inbound",
    from: "priya.shah@riverbendhs.org",
    fromName: "Priya Shah",
    subject: "Weekly install recap for the staff",
    text: "Would love a Monday-morning recap of last week's install — which plays the staff actually ran — so I don't have to open the iPad for the basics.",
    sent: 5 * DAY,
  },
  {
    id: "message-15",
    caseId: "case-8",
    thread: "thread-8",
    dir: "outbound",
    from: FOUNDER,
    subject: "Re: Weekly install recap for the staff",
    text: "Noted — it's on the shortlist. Curious: which 3 numbers would you want at the top of that recap?",
    sent: 4 * DAY,
  },
  {
    id: "message-16",
    caseId: null,
    triage: "pending",
    thread: "thread-9",
    dir: "inbound",
    from: "riley@lakeridgeathletics.com",
    fromName: "Riley Nash",
    subject: "Playbook sync after Friday's install",
    text: "Hi Rashad — I'm the OC at Lakeridge. After Friday's install the playbook never finished syncing to the staff iPads. Is there a known fix, or should I send a screenshot?",
    sent: 3 * HOUR,
  },
  {
    id: "message-17",
    caseId: null,
    triage: "pending",
    thread: "thread-10",
    dir: "inbound",
    from: "alex@oakmontcoaches.net",
    fromName: "Alex Kim",
    subject: "Staff seats for the Oakmont coaches",
    text: "Hey — we need six Staff seats for Oakmont's coaches before next week's install. Is there a partner path, or do I just add them on Monthly?",
    sent: 22 * HOUR,
  },
  {
    id: "message-18",
    caseId: null,
    triage: "pending",
    thread: "thread-10",
    dir: "inbound",
    from: "alex@oakmontcoaches.net",
    fromName: "Alex Kim",
    subject: "Re: Staff seats for the Oakmont coaches",
    text: "Following up on the below — happy to jump on a call if billing for Staff vs Annual is the hold-up.",
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
      body: "Reproduced on the staff iPad — invite POST 500s when a Staff seat already has a pending invite for the same address.",
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
      body: "Apple Pencil stroke-skip clip drafted — send to Colin once reviewed.",
      createdAt: at(nowMs, 5 * DAY),
    },
  ]
}

export const SEED_CONTACT_IDS: ReadonlySet<string> = new Set(seedContacts(0).map((c) => c.id))
export const SEED_CASE_IDS: ReadonlySet<string> = new Set(seedCases(0).map((c) => c.id))
export const SEED_NOTE_IDS: ReadonlySet<string> = new Set(seedNotes(0).map((n) => n.id))
export const SEED_MESSAGE_IDS: ReadonlySet<string> = new Set(seedMessages(0).map((m) => m.id))
export const SEED_THREAD_IDS: ReadonlySet<string> = new Set(seedMessages(0).map((m) => m.threadId))

export function isSeedContact(id: string) {
  return SEED_CONTACT_IDS.has(id)
}

export function isSeedCase(id: string) {
  return SEED_CASE_IDS.has(id)
}

export function isSeedNote(id: string) {
  return SEED_NOTE_IDS.has(id)
}

export function isSeedMessage(id: string) {
  return SEED_MESSAGE_IDS.has(id)
}

export function isSeedThread(id: string) {
  return SEED_THREAD_IDS.has(id)
}
