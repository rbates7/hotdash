import type Database from "better-sqlite3"

import type { Db } from "../src/lib/crm/db/client"
import {
  cases,
  contacts,
  emailMessages,
  notes,
  organizations,
} from "../src/lib/crm/db/schema"

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function seed(db: Db, sqlite: Database.Database, now: number) {
  sqlite.exec(`
    DELETE FROM notes;
    DELETE FROM email_messages;
    DELETE FROM cases;
    DELETE FROM contacts;
    DELETE FROM organizations;
    DELETE FROM ignored_senders;
    DELETE FROM sync_runs;
    DELETE FROM sync_state;
    DELETE FROM settings;
  `)

  const at = (offsetMs: number) => new Date(now - offsetMs)

  db.insert(organizations)
    .values([
      { id: "org_acme", name: "Acme Robotics", domain: "acme.com", createdAt: at(90 * DAY), updatedAt: at(90 * DAY) },
      { id: "org_birchwood", name: "Birchwood Labs", domain: "birchwood.io", createdAt: at(60 * DAY), updatedAt: at(60 * DAY) },
      { id: "org_sunrise", name: "Sunrise Media", domain: "sunrisemedia.co", createdAt: at(45 * DAY), updatedAt: at(45 * DAY) },
    ])
    .run()

  db.insert(contacts)
    .values([
      { id: "contact_dana", email: "dana@acme.com", firstName: "Dana", lastName: "Whitfield", nameSource: "supabase", organizationId: "org_acme", stripeCustomerId: "cus_dev_dana", plan: "Growth", planStatus: "active", planStartedAt: at(400 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_8812", signupAt: at(400 * DAY), lastActiveAt: at(2 * HOUR), appProfile: { team: "Acme Robotics HS", role: "Head Coach", seats: 24 }, source: "stripe", createdAt: at(90 * DAY), updatedAt: at(2 * DAY) },
      { id: "contact_marcus", email: "marcus@acme.com", firstName: "Marcus", lastName: "Lee", nameSource: "supabase", organizationId: "org_acme", stripeCustomerId: "cus_dev_marcus", plan: "Growth", planStatus: "active", planStartedAt: at(395 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_8813", signupAt: at(395 * DAY), lastActiveAt: at(1 * DAY), appProfile: { team: "Acme Robotics HS", role: "Offensive Coordinator", seats: 24 }, source: "stripe", createdAt: at(88 * DAY), updatedAt: at(5 * DAY) },
      { id: "contact_priya", email: "priya@birchwood.io", firstName: "Priya", lastName: "Raman", nameSource: "supabase", organizationId: "org_birchwood", stripeCustomerId: "cus_dev_priya", plan: "Starter", planStatus: "trialing", planStartedAt: new Date(now + 5 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_9120", signupAt: at(70 * DAY), lastActiveAt: at(3 * HOUR), appProfile: { team: "Birchwood Labs", role: "Analyst", seats: 6 }, source: "stripe", createdAt: at(60 * DAY), updatedAt: at(3 * DAY) },
      { id: "contact_jonah", email: "jonah@sunrisemedia.co", firstName: "Jonah", lastName: "Beck", nameSource: "stripe", organizationId: "org_sunrise", stripeCustomerId: "cus_dev_jonah", plan: "Pro", planStatus: "active", planStartedAt: at(500 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_7431", signupAt: at(500 * DAY), lastActiveAt: at(5 * DAY), appProfile: { team: "Sunrise Media", role: "Admin", seats: 12 }, source: "stripe", createdAt: at(45 * DAY), updatedAt: at(10 * DAY) },
      { id: "contact_elena", email: "elena@sunrisemedia.co", firstName: "Elena", lastName: "Souza", nameSource: "supabase", organizationId: "org_sunrise", stripeCustomerId: "cus_dev_elena", plan: "Pro", planStatus: "canceled", planStartedAt: at(498 * DAY), planEndedAt: at(3 * DAY), affiliation: null, appUserId: "chlk_7432", signupAt: at(498 * DAY), lastActiveAt: at(45 * DAY), appProfile: { team: "Sunrise Media", role: "Editor", seats: 12 }, source: "stripe", createdAt: at(44 * DAY), updatedAt: at(30 * DAY) },
      { id: "contact_ray", email: "ray.donnelly@gmail.com", firstName: "Ray", lastName: "Donnelly", nameSource: "stripe", organizationId: null, stripeCustomerId: "cus_dev_ray", plan: "Starter", planStatus: "active", planStartedAt: at(120 * DAY), planEndedAt: null, affiliation: "Westside High", appUserId: "chlk_10233", signupAt: at(120 * DAY), lastActiveAt: at(6 * HOUR), appProfile: { team: "Independent", role: "Position Coach", seats: 1 }, source: "stripe", createdAt: at(120 * DAY), updatedAt: at(6 * HOUR) },
      { id: "contact_bea", email: "bea.n.coach@outlook.com", firstName: "Bea", lastName: "Nakamura", nameSource: "stripe", organizationId: null, stripeCustomerId: "cus_dev_bea", plan: "Pro", planStatus: "active", planStartedAt: at(210 * DAY), planEndedAt: null, affiliation: "Northgate Prep", appUserId: "chlk_10456", signupAt: at(210 * DAY), lastActiveAt: at(2 * DAY), appProfile: { team: "Independent", role: "Head Coach", seats: 1 }, source: "stripe", createdAt: at(210 * DAY), updatedAt: at(2 * DAY) },
      { id: "contact_will", email: "wgrant.film@gmail.com", firstName: "Will", lastName: "Grant", nameSource: "gmail", organizationId: null, stripeCustomerId: "cus_dev_will", plan: "Starter", planStatus: "trialing", planStartedAt: new Date(now + 2 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_10877", signupAt: at(9 * DAY), lastActiveAt: at(20 * HOUR), appProfile: { team: "Independent", role: "Analyst", seats: 1 }, source: "stripe", createdAt: at(9 * DAY), updatedAt: at(20 * HOUR) },
      { id: "contact_sam", email: "coachsamv@icloud.com", firstName: "Sam", lastName: "Vega", nameSource: "stripe", organizationId: null, stripeCustomerId: "cus_dev_sam", plan: "Starter", planStatus: "canceled", planStartedAt: at(300 * DAY), planEndedAt: at(60 * DAY), affiliation: "westside high", appUserId: "chlk_9004", signupAt: at(300 * DAY), lastActiveAt: at(60 * DAY), appProfile: { team: "Independent", role: "Coach", seats: 1 }, source: "stripe", createdAt: at(300 * DAY), updatedAt: at(60 * DAY) },
      { id: "contact_kai", email: "kai.holt@westsidehs.org", firstName: "Kai", lastName: "Holt", nameSource: "supabase", organizationId: null, stripeCustomerId: null, plan: null, planStatus: null, planStartedAt: null, planEndedAt: null, affiliation: "Westside High", appUserId: "chlk_11002", signupAt: at(12 * DAY), lastActiveAt: at(1 * DAY), appProfile: { affiliation: "Westside High", role: "coach" }, source: "supabase", createdAt: at(12 * DAY), updatedAt: at(1 * DAY) },
      { id: "contact_lou", email: "lou.p@gmail.com", firstName: "Lou", lastName: "Park", nameSource: "supabase", organizationId: null, stripeCustomerId: null, plan: null, planStatus: null, planStartedAt: null, planEndedAt: null, affiliation: " Westside High ", appUserId: "chlk_11003", signupAt: at(8 * DAY), lastActiveAt: at(2 * DAY), appProfile: { affiliation: " Westside High ", role: "coach" }, source: "supabase", createdAt: at(8 * DAY), updatedAt: at(2 * DAY) },
      { id: "contact_tom", email: "tom.alvarez@gmail.com", firstName: "Tom", lastName: "Alvarez", nameSource: "gmail", organizationId: null, stripeCustomerId: "cus_dev_tom", plan: "Starter", planStatus: "active", planStartedAt: at(5 * DAY), planEndedAt: null, affiliation: null, appUserId: "chlk_9908", signupAt: at(35 * DAY), lastActiveAt: at(26 * HOUR), appProfile: { team: "Independent", role: "Coach", seats: 1 }, source: "stripe", createdAt: at(30 * DAY), updatedAt: at(1 * DAY) },
    ])
    .run()

  type CaseSeed = {
    id: string
    n: number
    subject: string
    status: "new" | "open" | "waiting" | "closed"
    priority: "low" | "normal" | "high" | "urgent"
    contactId: string
    thread: string
    lastActivity: number
    lastInbound?: number
    lastOutbound?: number
    closed?: number
    created: number
  }

  const caseSeeds: CaseSeed[] = [
    { id: "case_1", n: 1, subject: "Can't invite teammates to workspace", status: "open", priority: "high", contactId: "contact_dana", thread: "thread_dev_1", lastActivity: 2 * HOUR, lastInbound: 2 * HOUR, lastOutbound: 5 * HOUR, created: 1 * DAY },
    { id: "case_2", n: 2, subject: "Billing question about seats", status: "closed", priority: "normal", contactId: "contact_dana", thread: "thread_dev_2", lastActivity: 20 * DAY, lastInbound: 20 * DAY, lastOutbound: 20 * DAY + 2 * HOUR, closed: 19 * DAY, created: 24 * DAY },
    { id: "case_3", n: 3, subject: "CSV export times out on large ranges", status: "waiting", priority: "normal", contactId: "contact_marcus", thread: "thread_dev_3", lastActivity: 1 * DAY, lastOutbound: 1 * DAY, lastInbound: 2 * DAY, created: 3 * DAY },
    { id: "case_4", n: 4, subject: "Onboarding checklist stuck at step 3", status: "new", priority: "normal", contactId: "contact_priya", thread: "thread_dev_4", lastActivity: 3 * HOUR, lastInbound: 3 * HOUR, created: 3 * HOUR },
    { id: "case_5", n: 5, subject: "API rate limits for reporting integration", status: "open", priority: "urgent", contactId: "contact_jonah", thread: "thread_dev_5", lastActivity: 5 * DAY, lastInbound: 5 * DAY, lastOutbound: 6 * DAY, created: 8 * DAY },
    { id: "case_6", n: 6, subject: "Cancel subscription and export data", status: "closed", priority: "low", contactId: "contact_elena", thread: "thread_dev_6", lastActivity: 30 * DAY, lastInbound: 30 * DAY, closed: 29 * DAY, created: 31 * DAY },
    { id: "case_7", n: 7, subject: "Login loop on Safari 18", status: "open", priority: "normal", contactId: "contact_tom", thread: "thread_dev_7", lastActivity: 26 * HOUR, lastInbound: 26 * HOUR, created: 2 * DAY },
    { id: "case_8", n: 8, subject: "Feature request: weekly digest email", status: "waiting", priority: "low", contactId: "contact_priya", thread: "thread_dev_8", lastActivity: 4 * DAY, lastOutbound: 4 * DAY, lastInbound: 5 * DAY, created: 6 * DAY },
    { id: "case_9", n: 9, subject: "Can I move my film library to a new account?", status: "open", priority: "normal", contactId: "contact_bea", thread: "thread_dev_9", lastActivity: 4 * HOUR, lastInbound: 4 * HOUR, created: 1 * DAY },
    { id: "case_10", n: 10, subject: "Trial ended but I was still uploading", status: "new", priority: "high", contactId: "contact_will", thread: "thread_dev_10", lastActivity: 40 * MIN, lastInbound: 40 * MIN, created: 40 * MIN },
    { id: "case_11", n: 11, subject: "Refund for last month", status: "waiting", priority: "normal", contactId: "contact_sam", thread: "thread_dev_11", lastActivity: 3 * DAY, lastOutbound: 3 * DAY, lastInbound: 4 * DAY, created: 5 * DAY },
    // Sent from the feedback form inside the app, not by email.
    { id: "case_12", n: 12, subject: "Rated 3 · The play editor crashes when I rotate the iPad mid-drag", status: "new", priority: "normal", contactId: "contact_ray", thread: "feedback:seed-1", lastActivity: 90 * MIN, lastInbound: 90 * MIN, created: 90 * MIN },
  ]

  db.insert(cases)
    .values(
      caseSeeds.map((c) => ({
        id: c.id,
        caseNumber: c.n,
        subject: c.subject,
        status: c.status,
        priority: c.priority,
        contactId: c.contactId,
        gmailThreadId: c.thread,
        lastActivityAt: at(c.lastActivity),
        lastInboundAt: c.lastInbound ? at(c.lastInbound) : null,
        lastOutboundAt: c.lastOutbound ? at(c.lastOutbound) : null,
        closedAt: c.closed ? at(c.closed) : null,
        createdAt: at(c.created),
        updatedAt: at(c.lastActivity),
      }))
    )
    .run()

  sqlite
    .prepare("UPDATE counters SET value = ? WHERE id = 'case'")
    .run(caseSeeds.length)

  const founder = "rashad@chlk.xyz"
  type MsgSeed = {
    id: string
    caseId: string | null
    triage?: "pending" | "ignored"
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

  const msgs: MsgSeed[] = [
    { id: "msg_1_1", caseId: "case_1", thread: "thread_dev_1", dir: "inbound", from: "dana@acme.com", fromName: "Dana Whitfield", subject: "Can't invite teammates to workspace", text: "Hey — when I try to invite my teammates from the workspace settings page, the invite button spins forever and nothing sends. We're trying to onboard three new people this week. Can you take a look?", sent: 1 * DAY },
    { id: "msg_1_2", caseId: "case_1", thread: "thread_dev_1", dir: "outbound", from: founder, subject: "Re: Can't invite teammates to workspace", text: "Hi Dana, sorry about that! Quick question so I can dig in: are the teammates you're inviting on your acme.com domain, or external addresses? Also — roughly what time did you last try? I'll check the logs.", sent: 5 * HOUR },
    { id: "msg_1_3", caseId: "case_1", thread: "thread_dev_1", dir: "inbound", from: "dana@acme.com", fromName: "Dana Whitfield", subject: "Re: Can't invite teammates to workspace", text: "All three are on acme.com. Last try was about 20 minutes before I emailed you. Attached a screenshot of the spinner.", sent: 2 * HOUR, attachments: [{ filename: "invite-spinner.png", mimeType: "image/png", size: 482133 }] },
    { id: "msg_2_1", caseId: "case_2", thread: "thread_dev_2", dir: "inbound", from: "dana@acme.com", fromName: "Dana Whitfield", subject: "Billing question about seats", text: "If we add two more seats mid-cycle, do we get charged prorated or full month?", sent: 20 * DAY },
    { id: "msg_2_2", caseId: "case_2", thread: "thread_dev_2", dir: "outbound", from: founder, subject: "Re: Billing question about seats", text: "Prorated automatically — you'll see the partial charge on the next invoice. Nothing you need to do.", sent: 20 * DAY - 2 * HOUR },
    { id: "msg_3_1", caseId: "case_3", thread: "thread_dev_3", dir: "inbound", from: "marcus@acme.com", fromName: "Marcus Lee", subject: "CSV export times out on large ranges", text: "Exporting anything over ~90 days of data just hangs and eventually errors with a timeout. 30-day ranges work fine.", sent: 2 * DAY },
    { id: "msg_3_2", caseId: "case_3", thread: "thread_dev_3", dir: "outbound", from: founder, subject: "Re: CSV export times out on large ranges", text: "Thanks Marcus — I can reproduce it. Working on chunking the export; will follow up when it's deployed. Should be a couple of days.", sent: 1 * DAY },
    { id: "msg_4_1", caseId: "case_4", thread: "thread_dev_4", dir: "inbound", from: "priya@birchwood.io", fromName: "Priya Raman", subject: "Onboarding checklist stuck at step 3", text: "The 'connect your data source' step never completes even though the connection test passes. The checklist stays at step 3 of 5.", html: "<p>The <b>connect your data source</b> step never completes even though the connection test passes.</p><p>The checklist stays at step 3 of 5.</p>", sent: 3 * HOUR },
    { id: "msg_5_1", caseId: "case_5", thread: "thread_dev_5", dir: "inbound", from: "jonah@sunrisemedia.co", fromName: "Jonah Beck", subject: "API rate limits for reporting integration", text: "We're hitting 429s pulling hourly metrics for our internal dashboard. What are the actual limits on the Pro plan, and can they be raised?", sent: 8 * DAY },
    { id: "msg_5_2", caseId: "case_5", thread: "thread_dev_5", dir: "outbound", from: founder, subject: "Re: API rate limits for reporting integration", text: "Pro is 600 requests/min today. Tell me a bit about your pull pattern — if it's bursty we can probably fit you under a batched endpoint instead of raising the cap.", sent: 6 * DAY },
    { id: "msg_5_3", caseId: "case_5", thread: "thread_dev_5", dir: "inbound", from: "jonah@sunrisemedia.co", fromName: "Jonah Beck", subject: "Re: API rate limits for reporting integration", text: "It's one big pull at the top of every hour — about 2,000 requests over 3 minutes. Batching sounds right, where do we start?", sent: 5 * DAY },
    { id: "msg_6_1", caseId: "case_6", thread: "thread_dev_6", dir: "inbound", from: "elena@sunrisemedia.co", fromName: "Elena Souza", subject: "Cancel subscription and export data", text: "We're consolidating tools — please cancel our subscription at the end of the cycle. Also, how do I export all our historical data first?", sent: 30 * DAY },
    { id: "msg_7_1", caseId: "case_7", thread: "thread_dev_7", dir: "inbound", from: "tom.alvarez@gmail.com", fromName: "Tom Alvarez", subject: "Login loop on Safari 18", text: "On Safari 18 I sign in, get redirected to the dashboard for a second, then bounced back to the login page. Chrome works fine.", sent: 26 * HOUR },
    { id: "msg_8_1", caseId: "case_8", thread: "thread_dev_8", dir: "inbound", from: "priya@birchwood.io", fromName: "Priya Raman", subject: "Feature request: weekly digest email", text: "Would love a Monday-morning digest of the previous week's numbers so I don't have to log in for the basics.", sent: 5 * DAY },
    { id: "msg_8_2", caseId: "case_8", thread: "thread_dev_8", dir: "outbound", from: founder, subject: "Re: Feature request: weekly digest email", text: "Noted — it's on the shortlist. Curious: which 3 numbers would you want at the top of that email?", sent: 4 * DAY },
    { id: "msg_9_1", caseId: "case_9", thread: "thread_dev_9", dir: "inbound", from: "bea.n.coach@outlook.com", fromName: "Bea Nakamura", subject: "Can I move my film library to a new account?", text: "I'm switching from my personal email to my school address next season. Can my whole film library and tags come with me, or do I have to start over?", sent: 4 * HOUR },
    { id: "msg_10_1", caseId: "case_10", thread: "thread_dev_10", dir: "inbound", from: "wgrant.film@gmail.com", fromName: "Will Grant", subject: "Trial ended but I was still uploading", text: "My trial cut off mid-upload last night and I lost about an hour of clips. Is there any way to get those back, and can I extend a few days before I commit?", sent: 40 * MIN },
    { id: "msg_11_1", caseId: "case_11", thread: "thread_dev_11", dir: "inbound", from: "coachsamv@icloud.com", fromName: "Sam Vega", subject: "Refund for last month", text: "I cancelled in the spring but got charged again. Season's over for us so I'd like the last charge back if that's possible.", sent: 4 * DAY },
    { id: "msg_11_2", caseId: "case_11", thread: "thread_dev_11", dir: "outbound", from: founder, subject: "Re: Refund for last month", text: "Sorry about that Sam — I can see the charge. Refund is on its way and should land in a few business days. I've made sure nothing renews again.", sent: 3 * DAY },
    { id: "msg_t1_1", caseId: null, triage: "pending", thread: "thread_dev_t1", dir: "inbound", from: "lena@futurebridge.vc", fromName: "Lena Ortiz", subject: "Intro — Futurebridge <> Chlk", text: "Hi Rashad, I lead early-stage investments at Futurebridge. We've been following Chlk and would love to hear where you're headed. Open to a 30-minute call in the next couple of weeks?", sent: 7 * HOUR },
    { id: "msg_t2_1", caseId: null, triage: "pending", thread: "thread_dev_t2", dir: "inbound", from: "alex@contractorplus.app", fromName: "Alex Kim", subject: "Integration question", text: "Hey — we build field-service software and a few shared customers asked about a Chlk integration. Is there a partner API or should we scrape the CSV exports?", sent: 22 * HOUR },
    { id: "msg_t2_2", caseId: null, triage: "pending", thread: "thread_dev_t2", dir: "inbound", from: "alex@contractorplus.app", fromName: "Alex Kim", subject: "Re: Integration question", text: "Following up on the below — happy to sign an NDA if that helps.", sent: 4 * HOUR },
  ]

  db.insert(emailMessages)
    .values(
      msgs.map((m) => ({
        id: m.id,
        gmailMessageId: `gm_${m.id}`,
        gmailThreadId: m.thread,
        caseId: m.caseId,
        contactId: caseSeeds.find((c) => c.id === m.caseId)?.contactId ?? null,
        triageState: m.triage ?? null,
        direction: m.dir,
        fromEmail: m.from,
        fromName: m.fromName ?? null,
        toEmails: m.dir === "inbound" ? [founder] : [msgs.find((x) => x.thread === m.thread && x.dir === "inbound")?.from ?? founder],
        ccEmails: [],
        subject: m.subject,
        snippet: m.text.slice(0, 120),
        bodyText: m.text,
        bodyHtml: m.html ?? null,
        attachments: m.attachments ?? [],
        sentAt: at(m.sent),
        createdAt: at(m.sent),
      }))
    )
    .run()

  // Mail the founder started: Tom's welcome the day after he began paying
  // (fills his "reached out" tick), and a check-in to Ray with no reply.
  db.insert(emailMessages)
    .values([
      { id: "msg_out_tom", gmailMessageId: "gm_msg_out_tom", gmailThreadId: "thread_dev_welcome_tom", caseId: null, contactId: "contact_tom", direction: "outbound", fromEmail: founder, fromName: "Rashad Bates", toEmails: ["tom.alvarez@gmail.com"], ccEmails: [], subject: "Welcome to Chlk", snippet: "Glad to have you on board. Anything I can help with this week?", bodyText: "Glad to have you on board. Anything I can help with this week?", bodyHtml: null, attachments: [], sentAt: at(4 * DAY), createdAt: at(4 * DAY) },
      { id: "msg_out_ray", gmailMessageId: "gm_msg_out_ray", gmailThreadId: "thread_dev_checkin_ray", caseId: null, contactId: "contact_ray", direction: "outbound", fromEmail: founder, fromName: "Rashad Bates", toEmails: ["ray.donnelly@gmail.com"], ccEmails: [], subject: "How's the season going?", snippet: "Checking in — anything we could do better before playoffs?", bodyText: "Checking in — anything we could do better before playoffs?", bodyHtml: null, attachments: [], sentAt: at(12 * DAY), createdAt: at(12 * DAY) },
    ])
    .run()

  db.insert(emailMessages)
    .values({
      id: "msg_12_1",
      channel: "feedback",
      gmailMessageId: "feedback:seed-1",
      gmailThreadId: "feedback:seed-1",
      caseId: "case_12",
      contactId: "contact_ray",
      direction: "inbound",
      fromEmail: "ray.donnelly@gmail.com",
      fromName: "Ray Donnelly",
      toEmails: [],
      ccEmails: [],
      subject: "Rated 3 · The play editor crashes when I rotate the iPad mid-drag",
      snippet: "Chance to recommend: 3 The play editor crashes when I rotate the iPad mid-drag. Happens every time, lost a whole install.",
      bodyText: "Chance to recommend: 3\n\nThe play editor crashes when I rotate the iPad mid-drag. Happens every time, lost a whole install.",
      bodyHtml: null,
      attachments: [],
      sentAt: at(90 * MIN),
      createdAt: at(90 * MIN),
    })
    .run()

  db.insert(notes)
    .values([
      { id: "note_1", caseId: "case_1", kind: "user", body: "Reproduced on staging — invite POST 500s when the workspace has a pending invite for the same address.", createdAt: at(4 * HOUR) },
      { id: "note_2", caseId: "case_3", kind: "system", body: "Status changed to Waiting on customer", createdAt: at(1 * DAY) },
      { id: "note_3", caseId: "case_2", kind: "system", body: "Status changed to Closed", createdAt: at(19 * DAY) },
      { id: "note_4", caseId: "case_6", kind: "system", body: "Status changed to Closed", createdAt: at(29 * DAY) },
      { id: "note_5", caseId: "case_5", kind: "user", body: "Batched endpoint spec drafted — send to Jonah once reviewed.", createdAt: at(5 * DAY) },
      // Notes and calls about a person rather than a case.
      { id: "note_6", caseId: null, contactId: "contact_dana", kind: "call", body: "Called about the invite bug. She's fine waiting until Friday if I text her when it's fixed.", createdAt: at(3 * HOUR) },
      { id: "note_7", caseId: null, contactId: "contact_bea", kind: "user", body: "Prefers texts over email. Also coaches Westside's JV squad.", createdAt: at(2 * DAY) },
    ])
    .run()

  return {
    organizations: 3,
    contacts: 12,
    cases: caseSeeds.length,
    messages: msgs.length + 3,
  }
}
