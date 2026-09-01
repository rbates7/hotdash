/**
 * One-off repair for contact-form cases created before the CRM could read
 * through the form host.
 *
 *   pnpm crm:repair-forms          # report only
 *   pnpm crm:repair-forms --write  # apply
 *
 * Two things get fixed, both from data already stored on the message:
 *  - Case subjects. Every submission through one form carries the same
 *    template subject, so a queue of them is indistinguishable at a glance.
 *  - Contact names. The form asks for a name; before the parser could find
 *    it, these people existed as a bare email address.
 *
 * Manually edited names are never overwritten.
 */
import { eq } from "drizzle-orm"

import { createDb } from "../src/lib/crm/db/client"
import { cases, contacts, emailMessages } from "../src/lib/crm/db/schema"
import {
  parseFormFields,
  scannableBody,
  subjectFromForm,
} from "../src/lib/crm/gmail/parse"

const write = process.argv.includes("--write")
const dbPath = process.env.DATABASE_PATH ?? "./data/crm.db"
const { db } = createDb(dbPath)

function splitName(full: string): { first: string; last: string | null } {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { first: parts[0]!, last: null }
  return { first: parts[0]!, last: parts.slice(1).join(" ") }
}

let subjectsFixed = 0
let namesFixed = 0
let examined = 0
let withoutBody = 0
let withoutFields = 0

for (const caseRow of db.select().from(cases).all()) {
  // The earliest message is the submission itself; later ones are the thread.
  const messages = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.caseId, caseRow.id))
    .all()
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())

  const seed = messages[0]
  if (!seed) continue

  examined += 1
  // Form hosts often send HTML only, so bodyText alone is empty on exactly
  // the messages this repair is for.
  const body = scannableBody(seed.bodyText, seed.bodyHtml)
  if (!body) {
    withoutBody += 1
    continue
  }
  const fields = parseFormFields(body)
  if (!fields.has("message") && !fields.has("name")) {
    withoutFields += 1
    continue
  }

  const derived = subjectFromForm(body)
  if (derived && derived !== caseRow.subject) {
    console.log(`#${caseRow.caseNumber}  ${caseRow.subject}\n           → ${derived}`)
    subjectsFixed += 1
    if (write) {
      db.update(cases).set({ subject: derived }).where(eq(cases.id, caseRow.id)).run()
    }
  }

  const formName = fields.get("name")
  if (!formName) continue
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, caseRow.contactId))
    .get()
  // Anything a human typed, or Stripe/Supabase supplied, outranks the form.
  if (!contact || contact.nameSource === "manual") continue
  if (contact.firstName || contact.lastName) continue

  const { first, last } = splitName(formName)
  console.log(`           ${contact.email} → ${formName}`)
  namesFixed += 1
  if (write) {
    db.update(contacts)
      .set({ firstName: first, lastName: last, nameSource: "gmail", updatedAt: new Date() })
      .where(eq(contacts.id, contact.id))
      .run()
  }
}

console.log(
  `\nExamined ${examined} case${examined === 1 ? "" : "s"}: ` +
    `${withoutFields} carried no form fields, ${withoutBody} had no readable body.`
)
console.log(
  `${subjectsFixed} subject${subjectsFixed === 1 ? "" : "s"}, ` +
    `${namesFixed} name${namesFixed === 1 ? "" : "s"}` +
    (write ? " updated." : " would change. Re-run with --write to apply.")
)
