/**
 * One-off repair for contact-form cases.
 *
 *   pnpm crm:repair-forms          # report only
 *   pnpm crm:repair-forms --write  # apply
 *
 * Every submission through one form arrives from the same address with the
 * same subject, so Gmail files them in a single thread — and the CRM used
 * to key a case by that thread. The result was one case holding twenty
 * coaches' submissions, filed under whichever of them the case happened to
 * be created for, and a contact wearing someone else's name.
 *
 * The sync no longer does that: each submission is its own case. This
 * repairs what it did before, from data already on the messages.
 *
 *  - Splits a case whose messages come from more than one submitter, into
 *    one case per submission, each with its own contact.
 *  - Re-points each moved message at the person who actually wrote it.
 *  - Fixes case subjects, which are otherwise the form's template.
 *  - Gives a contact the name from that person's own submission.
 *
 * Manual, Stripe and Supabase names are never overwritten, and a case with
 * a single submitter is left alone — so a second run reports nothing.
 */
import { eq } from "drizzle-orm"

import { loadEnvLocal } from "./load-env"
import {
  applyMessageToCase,
  createCaseForThread,
} from "../src/lib/crm/cases/server"
import { normalizeEmail } from "../src/lib/crm/contacts/matching"
import {
  createContact,
  findContactByEmail,
} from "../src/lib/crm/contacts/server"
import { createDb } from "../src/lib/crm/db/client"
import { cases, contacts, emailMessages } from "../src/lib/crm/db/schema"
import {
  parseFormFields,
  scannableBody,
  subjectFromForm,
} from "../src/lib/crm/gmail/parse"
import { FORM_CASE_PREFIX } from "../src/lib/crm/gmail/sync"

loadEnvLocal()

const write = process.argv.includes("--write")
const { db } = createDb(process.env.DATABASE_PATH ?? "./data/crm.db")

const EMAIL_IN_TEXT = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@,;)]+/

function splitName(full: string) {
  const parts = full.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

/** Who really sent this message, read from the form fields in its body. */
function submissionIn(message: { bodyText: string | null; bodyHtml: string | null }) {
  const body = scannableBody(message.bodyText, message.bodyHtml)
  if (!body) return null
  const fields = parseFormFields(body)
  const email = fields.get("email")?.match(EMAIL_IN_TEXT)?.[0]
  if (!email) return null
  return { email: normalizeEmail(email), name: fields.get("name") ?? null, body }
}

const stats = {
  examined: 0,
  mixed: 0,
  created: 0,
  moved: 0,
  relinked: 0,
  subjects: 0,
  names: 0,
  senders: 0,
  newContacts: 0,
}

for (const caseRow of db.select().from(cases).all()) {
  const messages = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.caseId, caseRow.id))
    .all()
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  if (messages.length === 0) continue
  stats.examined += 1

  // Submissions only: a reply you sent on the case is not one.
  const submissions = []
  for (const message of messages) {
    const form = submissionIn(message)
    if (form) submissions.push({ message, form })
  }
  const seed = submissions[0]
  if (!seed) continue

  /** The contact for a submitter, created when the CRM has never seen them. */
  function contactFor(email: string, name: string | null) {
    const existing = findContactByEmail(db, email)
    if (existing) return existing
    stats.newContacts += 1
    if (!write) return null
    return createContact(db, {
      email,
      ...(name ? splitName(name) : {}),
      nameSource: name ? "gmail" : null,
      source: "gmail",
    })
  }

  // Everyone on this case who is not its earliest submitter.
  const others = submissions
    .slice(1)
    .filter((entry) => entry.form.email !== seed.form.email)

  if (others.length > 0) {
    stats.mixed += 1
    console.log(
      `#${caseRow.caseNumber} "${caseRow.subject}" — ${others.length + 1} submitters`
    )
    for (const entry of others) {
      const subject =
        subjectFromForm(entry.form.body) ??
        entry.message.subject ??
        "Form submission"
      console.log(`    → ${entry.form.email}: "${subject}"`)
      stats.created += 1
      stats.moved += 1
      const contact = contactFor(entry.form.email, entry.form.name)
      if (!write || !contact) continue
      const newCase = createCaseForThread(db, {
        contactId: contact.id,
        subject,
        gmailThreadId: `${FORM_CASE_PREFIX}${entry.message.gmailMessageId}`,
        createdAt: entry.message.sentAt,
      })
      db.update(emailMessages)
        .set({
          caseId: newCase.id,
          contactId: contact.id,
          fromEmail: entry.form.email,
          fromName: entry.form.name,
        })
        .where(eq(emailMessages.id, entry.message.id))
        .run()
      applyMessageToCase(db, newCase, {
        direction: entry.message.direction,
        sentAt: entry.message.sentAt,
        fromName: entry.form.name,
        fromEmail: entry.form.email,
      })
    }
  }

  // Whatever is left on the case is the seed submitter's; name the sender
  // on those messages too, or they stay attributed to the form host.
  for (const entry of submissions) {
    if (entry.message.fromEmail === entry.form.email) continue
    if (others.includes(entry)) continue
    stats.senders += 1
    if (write) {
      db.update(emailMessages)
        .set({ fromEmail: entry.form.email, fromName: entry.form.name })
        .where(eq(emailMessages.id, entry.message.id))
        .run()
    }
  }

  // The case that stays: its subject, and the person it is really about.
  const derived = subjectFromForm(seed.form.body)
  if (derived && derived !== caseRow.subject) {
    stats.subjects += 1
    if (write) {
      db.update(cases).set({ subject: derived }).where(eq(cases.id, caseRow.id)).run()
    }
  }

  // Compare by address, not by id: in report mode the right contact may
  // not exist yet, and the report has to say so anyway.
  const onCase = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, caseRow.contactId))
    .get()
  if (onCase && onCase.email !== seed.form.email) {
    console.log(
      `#${caseRow.caseNumber} is ${seed.form.email}'s, not ${onCase.email}'s`
    )
    stats.relinked += 1
    const seedContact = contactFor(seed.form.email, seed.form.name)
    if (write && seedContact) {
      db.update(cases)
        .set({ contactId: seedContact.id })
        .where(eq(cases.id, caseRow.id))
        .run()
      db.update(emailMessages)
        .set({ contactId: seedContact.id })
        .where(eq(emailMessages.caseId, caseRow.id))
        .run()
    }
  }

  // A name from this person's own submission — never from someone else's,
  // which is how a customer ended up wearing another coach's name.
  for (const entry of submissions) {
    if (!entry.form.name) continue
    const contact = findContactByEmail(db, entry.form.email)
    if (!contact) continue
    if (contact.nameSource && contact.nameSource !== "gmail") continue
    const { firstName, lastName } = splitName(entry.form.name)
    if (contact.firstName === firstName && contact.lastName === lastName) continue
    const was = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    console.log(`    ${contact.email}: ${was || "(no name)"} → ${entry.form.name}`)
    stats.names += 1
    if (write) {
      db.update(contacts)
        .set({ firstName, lastName, nameSource: "gmail", updatedAt: new Date() })
        .where(eq(contacts.id, contact.id))
        .run()
    }
  }
}

console.log(`\nExamined ${stats.examined} case${stats.examined === 1 ? "" : "s"}.`)
console.log(
  [
    `${stats.mixed} mixed`,
    `${stats.created} new case${stats.created === 1 ? "" : "s"}`,
    `${stats.moved} message${stats.moved === 1 ? "" : "s"} moved`,
    `${stats.senders} sender${stats.senders === 1 ? "" : "s"} named`,
    `${stats.newContacts} new contact${stats.newContacts === 1 ? "" : "s"}`,
    `${stats.relinked} relinked`,
    `${stats.subjects} subject${stats.subjects === 1 ? "" : "s"}`,
    `${stats.names} name${stats.names === 1 ? "" : "s"}`,
  ].join(", ") + (write ? " — applied." : " would change.")
)
if (!write) console.log("Nothing was changed. Re-run with --write to apply.")
