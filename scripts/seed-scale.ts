/**
 * Scale check: builds a book shaped like the real one — thousands of solo
 * coaches, organizations in the teens — so the list pages can be measured
 * under load rather than assumed to be fine.
 *
 *   pnpm crm:seed:scale [customers] [orgs]
 */
import { randomUUID } from "node:crypto"

import { createDb } from "../src/lib/crm/db/client"
import {
  cases,
  contacts,
  emailMessages,
  organizations,
} from "../src/lib/crm/db/schema"

const CUSTOMERS = Number(process.argv[2] ?? 3000)
const ORGS = Number(process.argv[3] ?? 15)
const STAFF_PER_ORG = 6

const FIRST = ["Ray", "Bea", "Will", "Sam", "Dana", "Marcus", "Priya", "Jonah", "Elena", "Tom", "Alex", "Jess", "Nate", "Omar", "Kai", "Lena", "Drew", "Rosa", "Ty", "Mel"]
const LAST = ["Donnelly", "Nakamura", "Grant", "Vega", "Whitfield", "Lee", "Raman", "Beck", "Souza", "Alvarez", "Kim", "Boyd", "Silva", "Haddad", "Ortiz", "Chen", "Baptiste", "Nowak", "Reyes", "Osei"]
const PLANS = ["Starter", "Growth", "Pro"]
const STATUSES = ["active", "active", "active", "trialing", "canceled"]
const SUBJECTS = ["Can't upload film", "Billing question", "Roster import failed", "Playbook sharing", "Login loop on Safari", "Export times out", "Trial extension", "Refund request"]
const CASE_STATUSES = ["new", "open", "waiting", "closed"] as const

const DAY = 86_400_000
const now = Date.now()
const at = (ms: number) => new Date(now - ms)
const pick = <T,>(list: readonly T[], i: number) => list[i % list.length]!
// Schools that solo coaches type into their profile. Every fifth individual
// names one, so each school gathers a dozen or so coaches — enough for the
// Prospective view to have real groups to sort and filter.
const SCHOOLS = Array.from({ length: 40 }, (_, i) => `${pick(LAST, i * 3)} ${i % 3 === 0 ? "High" : i % 3 === 1 ? "Prep" : "Academy"}`)

const file = process.env.DATABASE_PATH ?? "./data/crm.db"
const { db, sqlite } = createDb(file)

console.time("seed")
sqlite.exec(`
  DELETE FROM notes; DELETE FROM email_messages; DELETE FROM cases;
  DELETE FROM contacts; DELETE FROM organizations; DELETE FROM ignored_senders;
  DELETE FROM sync_runs; DELETE FROM sync_state; DELETE FROM settings;
`)

const orgRows = Array.from({ length: ORGS }, (_, i) => ({
  id: `org_${i}`,
  name: `${pick(LAST, i)} ${i % 2 === 0 ? "High School" : "Academy"}`,
  domain: `org${i}.example`,
  createdAt: at(500 * DAY),
  updatedAt: at(100 * DAY),
}))
db.insert(organizations).values(orgRows).run()

const staffCount = ORGS * STAFF_PER_ORG
const contactRows = Array.from({ length: CUSTOMERS }, (_, i) => {
  const isStaff = i < staffCount
  const first = pick(FIRST, i)
  const last = pick(LAST, i * 7 + 3)
  const planStatus = pick(STATUSES, i)
  const started = (i % 700) * DAY
  return {
    id: `c_${i}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    firstName: first,
    lastName: last,
    nameSource: "stripe" as const,
    organizationId: isStaff ? `org_${i % ORGS}` : null,
    stripeCustomerId: `cus_scale_${i}`,
    plan: pick(PLANS, i),
    planStatus,
    // A trial starts paying in the future; a canceled plan ended recently
    // enough for some of them to land in "Churned this week".
    planStartedAt:
      planStatus === "trialing" ? new Date(now + (i % 14) * DAY) : at(started),
    planEndedAt: planStatus === "canceled" ? at((i % 30) * DAY) : null,
    affiliation: !isStaff && i % 5 === 0 ? pick(SCHOOLS, i / 5) : null,
    appUserId: `chlk_${20000 + i}`,
    signupAt: at((i % 700) * DAY),
    lastActiveAt: at((i % 40) * DAY),
    appProfile: { team: isStaff ? orgRows[i % ORGS]!.name : "Independent", seats: isStaff ? 12 : 1 },
    source: "stripe" as const,
    createdAt: at((i % 700) * DAY),
    updatedAt: at((i % 40) * DAY),
  }
})
for (let i = 0; i < contactRows.length; i += 500) {
  db.insert(contacts).values(contactRows.slice(i, i + 500)).run()
}

// Roughly a third of customers have written in at least once.
const caseRows = []
const messageRows = []
let caseNumber = 0
for (let i = 0; i < CUSTOMERS; i += 3) {
  caseNumber += 1
  const id = `case_${caseNumber}`
  const sentAt = at((i % 90) * DAY)
  caseRows.push({
    id,
    caseNumber,
    subject: pick(SUBJECTS, i),
    status: pick(CASE_STATUSES, i),
    priority: "normal" as const,
    contactId: `c_${i}`,
    gmailThreadId: `thread_scale_${caseNumber}`,
    lastActivityAt: sentAt,
    lastInboundAt: sentAt,
    createdAt: sentAt,
    updatedAt: sentAt,
  })
  messageRows.push({
    id: randomUUID(),
    gmailMessageId: `gm_scale_${caseNumber}`,
    gmailThreadId: `thread_scale_${caseNumber}`,
    caseId: id,
    contactId: `c_${i}`,
    triageState: null,
    direction: "inbound" as const,
    fromEmail: contactRows[i]!.email,
    fromName: `${contactRows[i]!.firstName} ${contactRows[i]!.lastName}`,
    toEmails: ["rashad@chlk.xyz"],
    ccEmails: [],
    subject: pick(SUBJECTS, i),
    snippet: "Scale fixture message.",
    bodyText: "Scale fixture message.",
    bodyHtml: null,
    attachments: [],
    sentAt,
    createdAt: sentAt,
  })
}
for (let i = 0; i < caseRows.length; i += 500) {
  db.insert(cases).values(caseRows.slice(i, i + 500)).run()
}
for (let i = 0; i < messageRows.length; i += 500) {
  db.insert(emailMessages).values(messageRows.slice(i, i + 500)).run()
}
sqlite.prepare("UPDATE counters SET value = ? WHERE id = 'case'").run(caseNumber)
console.timeEnd("seed")
console.log(`Seeded ${file}:`, {
  organizations: ORGS,
  contacts: CUSTOMERS,
  staff: staffCount,
  individuals: CUSTOMERS - staffCount,
  cases: caseRows.length,
})
sqlite.close()
