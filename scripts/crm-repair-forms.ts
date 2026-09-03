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
 *  - Removes the form host itself from the customer list, once nothing of
 *    its own is left on it.
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
import {
  cases,
  contactEmails,
  contacts,
  emailMessages,
  notes,
} from "../src/lib/crm/db/schema"
import {
  isRelaySender,
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

/** A name a person would actually have. Anything carrying quote marks or an
 * address came out of a quoted reply and is not to be written anywhere. */
function looksLikeName(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 60) return false
  if (/[>@<|]/.test(trimmed)) return false
  return trimmed.split(/\s+/).length <= 4
}

/**
 * Who really sent this message. Only a notification the form host delivered
 * counts: a reply quoting one is not a submission, however much of the form
 * it repeats.
 */
function submissionIn(message: {
  fromEmail: string
  bodyText: string | null
  bodyHtml: string | null
}) {
  if (!isRelaySender(message.fromEmail)) return null
  // scannableBody drops quoted lines, so this is what the host sent.
  const body = scannableBody(message.bodyText, message.bodyHtml)
  if (!body) return null
  const fields = parseFormFields(body)
  const email = fields.get("email")?.match(EMAIL_IN_TEXT)?.[0]
  if (!email) return null
  const name = fields.get("name")
  return {
    email: normalizeEmail(email),
    name: name && looksLikeName(name) ? name.trim() : null,
    body,
  }
}

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

const stats = {
  examined: 0,
  mixed: 0,
  created: 0,
  moved: 0,
  relinked: 0,
  reported: 0,
  subjects: 0,
  names: 0,
  senders: 0,
  newContacts: 0,
}

/** Cases this run moves off a form host onto the person who wrote them. In
 * a report run they are still filed under the host, so the cleanup at the
 * end has to discount them to see what would actually be left behind. */
const relinkedOffHost = new Set<string>()

for (const caseRow of db.select().from(cases).all()) {
  const messages = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.caseId, caseRow.id))
    .all()
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  if (messages.length === 0) continue
  stats.examined += 1

  type Entry = {
    message: (typeof messages)[number]
    owner: string
    form: { email: string; name: string | null; body: string } | null
  }

  // Who each inbound message is from. A form host's notification names the
  // submitter inside; anything else came straight from a person.
  const submissions: Entry[] = []
  const direct: Entry[] = []
  for (const message of messages) {
    if (message.direction !== "inbound") continue
    const form = submissionIn(message)
    if (form) submissions.push({ message, owner: form.email, form })
    else if (!isRelaySender(message.fromEmail)) {
      direct.push({ message, owner: message.fromEmail, form: null })
    }
  }
  // Only a case built out of form notifications is a merged queue. An
  // ordinary thread with two people on it — a coach writing from a second
  // address, a colleague replying — is a conversation, and splitting it
  // would turn a reply into a case of its own.
  if (submissions.length === 0) continue

  const owners = [...new Set(submissions.map((entry) => entry.owner))]
  // A direct message from someone who submitted the form goes with their
  // submission. Anyone else is replying on the thread and stays put.
  const entries = [
    ...submissions,
    ...direct.filter((entry) => owners.includes(entry.owner)),
  ].sort((a, b) => a.message.sentAt.getTime() - b.message.sentAt.getTime())
  const caseContact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, caseRow.contactId))
    .get()
  // The case keeps the submitter it is already filed under, when that is one
  // of them; otherwise the earliest, and the case is relinked to them.
  const keeper =
    (caseContact && owners.find((owner) => owner === caseContact.email)) ??
    owners[0]!
  const keeperEntries = entries.filter((entry) => entry.owner === keeper)
  const seed = keeperEntries[0]!

  const subjectFor = (entry: Entry) =>
    (entry.form ? subjectFromForm(entry.form.body) : null) ??
    entry.message.subject ??
    "Form submission"

  if (owners.length > 1) {
    stats.mixed += 1
    console.log(
      `#${caseRow.caseNumber} "${caseRow.subject}" — ${owners.length} submitters`
    )
  }

  for (const owner of owners) {
    if (owner === keeper) continue
    const mine = entries.filter((entry) => entry.owner === owner)
    const first = mine[0]!
    const name = mine.find((entry) => entry.form?.name)?.form?.name ?? null
    const subject = subjectFor(first)
    console.log(`    → ${owner}: "${subject}"`)
    stats.created += 1

    // A reply of yours goes with the submission it answers, which its
    // recipient names.
    const replies = messages.filter(
      (message) =>
        message.direction === "outbound" && message.toEmails.includes(owner)
    )
    const moving = [...mine.map((entry) => entry.message), ...replies].sort(
      (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
    )
    stats.moved += moving.length

    const contact = contactFor(owner, name)
    if (!write || !contact) continue
    const newCase = createCaseForThread(db, {
      contactId: contact.id,
      subject,
      gmailThreadId: `${FORM_CASE_PREFIX}${first.message.gmailMessageId}`,
      createdAt: first.message.sentAt,
    })
    for (const message of moving) {
      const entry = mine.find((candidate) => candidate.message.id === message.id)
      db.update(emailMessages)
        .set({
          caseId: newCase.id,
          contactId: contact.id,
          ...(entry?.form
            ? { fromEmail: entry.form.email, fromName: entry.form.name }
            : {}),
        })
        .where(eq(emailMessages.id, message.id))
        .run()
      const current = db.select().from(cases).where(eq(cases.id, newCase.id)).get()!
      applyMessageToCase(db, current, {
        direction: message.direction,
        sentAt: message.sentAt,
        fromName: entry?.form?.name ?? message.fromName,
        fromEmail: entry?.form?.email ?? message.fromEmail,
      })
    }
  }

  // Messages that left took their dates with them: what is left decides
  // when this case last moved, and so whether it is waiting on a reply.
  if (owners.length > 1 && write) {
    const left = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, caseRow.id))
      .all()
    const newest = (direction: "inbound" | "outbound") =>
      left
        .filter((message) => message.direction === direction)
        .reduce<Date | null>(
          (best, message) =>
            !best || message.sentAt > best ? message.sentAt : best,
          null
        )
    const lastInboundAt = newest("inbound")
    const lastOutboundAt = newest("outbound")
    const lastActivityAt =
      [lastInboundAt, lastOutboundAt]
        .filter((date): date is Date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? caseRow.createdAt
    db.update(cases)
      .set({ lastInboundAt, lastOutboundAt, lastActivityAt })
      .where(eq(cases.id, caseRow.id))
      .run()
  }

  // What stays is the keeper's: name the sender on their own messages, or
  // they read as having come from the form host.
  for (const entry of keeperEntries) {
    if (!entry.form) continue
    if (entry.message.fromEmail === entry.form.email) continue
    stats.senders += 1
    if (write) {
      db.update(emailMessages)
        .set({ fromEmail: entry.form.email, fromName: entry.form.name })
        .where(eq(emailMessages.id, entry.message.id))
        .run()
    }
  }

  const derived = seed.form ? subjectFromForm(seed.form.body) : null
  if (derived && derived !== caseRow.subject) {
    stats.subjects += 1
    if (write) {
      db.update(cases).set({ subject: derived }).where(eq(cases.id, caseRow.id)).run()
    }
  }

  // Relink only when the case is filed under someone who never wrote on it.
  // A contact is never created just to move a case: a submitter the CRM has
  // never met, on a case that already belongs to a real person, is reported
  // and left alone — that is a coach mistyping their own address.
  if (caseContact && caseContact.email !== keeper) {
    const existing = findContactByEmail(db, keeper)
    const host = isRelaySender(caseContact.email)
    if (existing || host) {
      console.log(`#${caseRow.caseNumber} is ${keeper}'s, not ${caseContact.email}'s`)
      stats.relinked += 1
      if (host) relinkedOffHost.add(caseRow.id)
      const contact = existing ?? contactFor(keeper, seed.form?.name ?? null)
      if (write && contact) {
        db.update(cases)
          .set({ contactId: contact.id })
          .where(eq(cases.id, caseRow.id))
          .run()
        db.update(emailMessages)
          .set({ contactId: contact.id })
          .where(eq(emailMessages.caseId, caseRow.id))
          .run()
      }
    } else {
      console.log(
        `#${caseRow.caseNumber} was written by ${keeper} but is filed under ${caseContact.email} — left alone`
      )
      stats.reported += 1
    }
  }

  // A name from this person's own submission — never from someone else's,
  // which is how a customer ended up wearing another coach's name.
  for (const entry of entries) {
    if (!entry.form?.name) continue
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

// A form host is an address a website posts from, not a coach. Once its
// submissions sit on the people who wrote them it has nothing of its own,
// and leaving it in the customer list is how "form-submission@squarespace"
// ends up looking like an account. It only goes when it is genuinely
// empty: anything still attached is named instead and the contact stays.
const hosts = { removed: 0, kept: 0 }
for (const contact of db.select().from(contacts).all()) {
  if (!isRelaySender(contact.email)) continue
  const heldCases = db
    .select()
    .from(cases)
    .where(eq(cases.contactId, contact.id))
    .all()
    .filter((row) => !relinkedOffHost.has(row.id))
  const heldMessages = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.contactId, contact.id))
    .all()
    .filter((row) => row.caseId === null || !relinkedOffHost.has(row.caseId))
  const heldNotes = db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contact.id))
    .all()
  const aliases = db
    .select()
    .from(contactEmails)
    .where(eq(contactEmails.contactId, contact.id))
    .all()
  const held = [
    heldCases.length > 0 &&
      `${heldCases.length} case(s) #${heldCases.map((row) => row.caseNumber).join(", #")}`,
    heldMessages.length > 0 && `${heldMessages.length} message(s)`,
    heldNotes.length > 0 && `${heldNotes.length} note(s)`,
    aliases.length > 0 && `${aliases.length} linked address(es)`,
  ].filter((part): part is string => typeof part === "string")

  if (held.length > 0) {
    hosts.kept += 1
    console.log(
      `${contact.email} is a form host, not a customer — kept, it still holds ${held.join(", ")}`
    )
    continue
  }
  hosts.removed += 1
  console.log(`${contact.email} is a form host, not a customer — removed`)
  if (write) {
    db.delete(contacts).where(eq(contacts.id, contact.id)).run()
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
if (stats.reported > 0) {
  console.log(
    `${stats.reported} case(s) written by someone the CRM has never met, filed under a real customer — left alone.`
  )
}
if (hosts.removed > 0 || hosts.kept > 0) {
  console.log(
    `${hosts.removed} form host${hosts.removed === 1 ? "" : "s"} ${write ? "removed" : "would be removed"} from the customer list` +
      (hosts.kept > 0 ? `, ${hosts.kept} kept` : "")
  )
}
if (!write) console.log("Nothing was changed. Re-run with --write to apply.")
