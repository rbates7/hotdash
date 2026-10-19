import {
  CRM_LIMITS,
  domainFromEmail,
  isWellFormedEmail,
  type Case,
  type CaseStatus,
  type Contact,
  type EmailMessage,
  type MessageDirection,
  type Organization,
} from "@/lib/crm/crm"
import type { CrmLiveData } from "@/lib/crm/gmail-summary"
import { normalizeEmail, splitDisplayName } from "@/lib/crm/matching"
import { cleanSubject, transitionOnMessage } from "@/lib/crm/rules"

/**
 * Gmail threads (metadata only: headers, labels, snippet — never a body)
 * into the CRM's own rows. Pure, so it is unit-tested without Gmail.
 *
 * One case per thread, as the CRM's rules say, once the inbox has engaged
 * with the sender:
 * - a thread the mailbox has replied in (or started) is a **case**, and its
 *   sender a **contact**; so is any later thread from that same sender;
 * - a thread from a sender the mailbox has never replied to is **triage**:
 *   `pending` while it is in the inbox, `ignored` once archived;
 * - a case's status replays `transitionOnMessage` over its messages (new →
 *   waiting after a reply → open on the next inbound …); an archived
 *   conversation is `closed`;
 * - a starred thread is `high` priority, everything else `normal`.
 *
 * Gmail's metadata has no body, so a message's text is its snippet.
 *
 * Not every thread is a conversation. These are dropped whole, before
 * anything else (so they make no case, contact, triage row or message, and
 * a name in them appears nowhere), by `skipReason`:
 * - **bounce**: a delivery failure (mailer-daemon / postmaster, "Mail
 *   Delivery Subsystem", "Undeliverable", "Address not found" …);
 * - **billing**: an automated billing or failed-payment notice — from a
 *   billing sender (Stripe, PayPal, Apple, `billing@`, `receipts@` …), or
 *   opened by the mailbox with billing wording ("we weren't able to
 *   charge", "your monthly subscription", "your free trial of" …). A
 *   customer's reply to one is dropped with it: the notice's greeting
 *   carries their name;
 * - **outbound-only**: the mailbox wrote and no customer has replied (the
 *   app's own notices sent from the support address, mostly).
 */

/** The slice of a `threads.get?format=metadata` answer this module reads. */
export type GmailMessageMeta = {
  id: string
  labelIds: string[]
  /** Milliseconds since the epoch, as Gmail's decimal string. */
  internalDate: string
  snippet: string
  headers: { from: string | null; to: string | null; subject: string | null }
}

export type GmailThreadMeta = { id: string; messages: GmailMessageMeta[] }

/**
 * Stable numbers for Gmail's ids within one server process, so a case
 * keeps its number (and its URL) from one sync to the next. First seen,
 * first numbered.
 */
export type IdRegistry = { number(kind: "thread" | "contact" | "org", key: string): number }

export function createIdRegistry(): IdRegistry {
  const maps = { thread: new Map<string, number>(), contact: new Map<string, number>(), org: new Map<string, number>() }
  return {
    number(kind, key) {
      const map = maps[kind]
      let n = map.get(key)
      if (n === undefined) map.set(key, (n = map.size + 1))
      return n
    },
  }
}

/* ------------------------------------------------------------ headers */

export type Address = { email: string; name: string | null }

/** Splits on commas outside quotes and angle brackets. */
function splitAddresses(header: string) {
  const out: string[] = []
  let current = ""
  let quoted = false
  let angled = false
  for (const ch of header) {
    if (ch === '"') quoted = !quoted
    else if (ch === "<" && !quoted) angled = true
    else if (ch === ">" && !quoted) angled = false
    if (ch === "," && !quoted && !angled) {
      out.push(current)
      current = ""
    } else current += ch
  }
  out.push(current)
  return out
}

/** `"Name" <a@b.c>, d@e.f` → addresses; anything that is not a well-formed address is dropped. */
export function parseAddressList(header: string | null | undefined): Address[] {
  if (!header) return []
  const out: Address[] = []
  for (const part of splitAddresses(header)) {
    const angle = /<([^<>]*)>/.exec(part)
    const email = normalizeEmail(angle ? angle[1]! : part)
    if (!isWellFormedEmail(email)) continue
    const rawName = angle ? part.slice(0, angle.index).trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim() : ""
    const name = rawName && normalizeEmail(rawName) !== email ? rawName : null
    out.push({ email, name })
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/** Gmail's snippets are HTML-escaped; the CRM renders text. */
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

const clamp = (text: string, max: number) => text.trim().slice(0, max).trim()
const clampName = (name: string | null) => (name ? clamp(name, CRM_LIMITS.name) || null : null)

/* ------------------------------------------------------------ filters */

export type SkipReason = "bounce" | "billing" | "outbound_only"

/** Delivery-failure senders: the local part, or the display name. */
const BOUNCE_LOCAL = /^(mailer-daemon|postmaster|mail-daemon|bounces?)$/
const BOUNCE_NAME = /^(mail delivery (subsystem|system|service)|mail delivery failure|delivery status notification|postmaster)$/i
const BOUNCE_SUBJECT =
  /^(delivery status notification|undeliverable|undelivered mail|mail delivery failed|delivery (has )?failed|delivery failure|returned mail|failure notice|address not found|message not delivered)\b/i

/** Billing senders: whole domains, and billing local parts anywhere. */
const BILLING_DOMAINS = /(^|\.)(stripe\.com|paypal\.com|apple\.com|itunes\.com|chargebee\.com|paddle\.com|recurly\.com|braintreegateway\.com)$/
const BILLING_LOCAL = /^(billing|invoices?|receipts?|payments?|payment-noreply|payments-noreply|accounts-payable|subscriptions?)([+-].*)?$/
/** Billing wording, read only on what the mailbox sent: a customer may write "billing" about anything. */
const BILLING_TEXT =
  /\b(we (were not|weren['’]t|could not|couldn['’]t) (able to )?(charge|process|collect)|payment (failed|declined|unsuccessful|was unsuccessful|is overdue|past due)|failed payment|card (was )?declined|update your (payment|card|billing)|your (monthly|annual|yearly) subscription|subscription (renewal|has been renewed|receipt|confirmation|has been cancell?ed|is ending|will renew)|your free trial (of|has|ends|ended|is ending|will end)|free trial of|your trial (has|ends|ended|is ending|will end)|receipt for your|your receipt|payment receipt|invoice (#|no\.|number)|your invoice)/i

function isBounce(from: Address, subject: string) {
  const local = from.email.split("@")[0] ?? ""
  return BOUNCE_LOCAL.test(local) || (from.name !== null && BOUNCE_NAME.test(from.name.trim())) || BOUNCE_SUBJECT.test(subject.trim())
}

function isBillingSender(from: Address) {
  const [local = "", domain = ""] = from.email.split("@")
  return BILLING_DOMAINS.test(domain) || BILLING_LOCAL.test(local)
}

/**
 * Why a thread is not a conversation, or null when it is. Reads headers
 * and snippets only, like everything else here.
 */
export function skipReason(thread: GmailThreadMeta, mailbox: string): SkipReason | null {
  const me = normalizeEmail(mailbox)
  let inbound = false
  let first = true
  const messages = thread.messages
    .filter((m) => !m.labelIds.includes("DRAFT"))
    .sort((a, b) => Number(a.internalDate) - Number(b.internalDate))
  for (const m of messages) {
    const from = parseAddressList(m.headers.from)[0] ?? { email: me, name: null }
    const subject = m.headers.subject ?? ""
    const outbound = m.labelIds.includes("SENT") || from.email === me
    if (!outbound && isBounce(from, subject)) return "bounce"
    if (!outbound && isBillingSender(from)) return "billing"
    // Only a thread the mailbox opened: a human reply ("I've resent your
    // invoice") is a conversation, an automated notice starts one.
    if (first && outbound && BILLING_TEXT.test(`${subject}\n${decodeEntities(m.snippet ?? "")}`)) return "billing"
    if (!outbound) inbound = true
    first = false
  }
  return inbound ? null : "outbound_only"
}

/* ------------------------------------------------------------ mapping */

type Prepared = {
  gmailId: string
  messages: Array<{
    meta: GmailMessageMeta
    at: number
    direction: MessageDirection
    from: Address
    to: Address[]
  }>
  external: Address
  firstAt: number
  lastAt: number
  inInbox: boolean
  starred: boolean
  replied: boolean
}

function prepare(thread: GmailThreadMeta, me: string): Prepared | null {
  const messages = thread.messages
    .filter((m) => !m.labelIds.includes("DRAFT"))
    .map((meta) => {
      const at = Number(meta.internalDate)
      const from = parseAddressList(meta.headers.from)[0] ?? null
      const outbound = meta.labelIds.includes("SENT") || from?.email === me
      return {
        meta,
        at,
        direction: (outbound ? "outbound" : "inbound") as MessageDirection,
        from: from ?? { email: me, name: null },
        to: parseAddressList(meta.headers.to),
      }
    })
    .filter((m) => Number.isFinite(m.at) && m.at > 0 && (m.direction === "outbound" || m.from.email !== me))
    .sort((a, b) => a.at - b.at)
  if (messages.length === 0) return null
  const inbound = messages.filter((m) => m.direction === "inbound")
  // The customer: who wrote in, by the latest name they gave; or, for a
  // thread the mailbox started, who it wrote to.
  const external = inbound.length
    ? {
        email: inbound[0]!.from.email,
        name:
          [...inbound].reverse().find((m) => m.from.email === inbound[0]!.from.email && m.from.name)?.from.name ?? null,
      }
    : (messages.flatMap((m) => m.to).find((a) => a.email !== me) ?? null)
  if (!external || external.email.length > CRM_LIMITS.email) return null
  return {
    gmailId: thread.id,
    messages,
    external,
    firstAt: messages[0]!.at,
    lastAt: messages[messages.length - 1]!.at,
    inInbox: messages.some((m) => m.meta.labelIds.includes("INBOX")),
    starred: messages.some((m) => m.meta.labelIds.includes("STARRED")),
    replied: messages.some((m) => m.direction === "outbound"),
  }
}

const iso = (ms: number) => new Date(ms).toISOString()

function caseStatus(p: Prepared): CaseStatus {
  let status: CaseStatus = "new"
  for (const m of p.messages) status = transitionOnMessage(status, m.direction).status
  // Archived after the customer wrote: the conversation is done. A thread
  // the mailbox started and nobody answered yet is still waiting.
  const hasInbound = p.messages.some((m) => m.direction === "inbound")
  return !p.inInbox && hasInbound ? "closed" : status
}

export function mapGmailThreads(
  threads: readonly GmailThreadMeta[],
  { mailbox, ids = createIdRegistry() }: { mailbox: string; ids?: IdRegistry }
): CrmLiveData {
  const me = normalizeEmail(mailbox)
  const prepared = threads
    .filter((t) => skipReason(t, me) === null)
    .map((t) => prepare(t, me))
    .filter((p): p is Prepared => p !== null)
    .sort((a, b) => a.firstAt - b.firstAt || (a.gmailId < b.gmailId ? -1 : a.gmailId > b.gmailId ? 1 : 0))

  const known = new Set(prepared.filter((p) => p.replied).map((p) => p.external.email))
  const isCase = (p: Prepared) => known.has(p.external.email)

  const organizations = new Map<string, Organization>()
  const contacts = new Map<string, Contact>()
  const cases: Case[] = []
  const messages: EmailMessage[] = []
  let messageN = 0

  for (const p of prepared) {
    const threadN = ids.number("thread", p.gmailId)
    const threadId = `thread-${threadN}`
    let caseId: string | null = null

    if (isCase(p)) {
      let contact = contacts.get(p.external.email)
      if (!contact) {
        const domain = domainFromEmail(p.external.email)
        let organizationId: string | null = null
        if (domain && domain.length <= CRM_LIMITS.email) {
          let org = organizations.get(domain)
          if (!org) {
            org = { id: `org-${ids.number("org", domain)}`, name: clamp(domain, CRM_LIMITS.org), domain }
            organizations.set(domain, org)
          }
          organizationId = org.id
        }
        const { firstName, lastName } = splitDisplayName(p.external.name)
        contact = {
          id: `contact-${ids.number("contact", p.external.email)}`,
          email: p.external.email,
          firstName: clampName(firstName),
          lastName: clampName(lastName),
          nameSource: p.external.name ? "gmail" : null,
          organizationId,
          plan: null,
          planStatus: null,
          source: "gmail",
          createdAt: iso(p.firstAt),
        }
        contacts.set(contact.email, contact)
      }
      const status = caseStatus(p)
      const lastOf = (direction: MessageDirection) => {
        const hit = [...p.messages].reverse().find((m) => m.direction === direction)
        return hit ? iso(hit.at) : null
      }
      caseId = `case-${threadN}`
      cases.push({
        id: caseId,
        caseNumber: threadN,
        subject: clamp(cleanSubject(p.messages[0]!.meta.headers.subject), CRM_LIMITS.subject) || "(no subject)",
        status,
        priority: p.starred ? "high" : "normal",
        contactId: contact.id,
        lastActivityAt: iso(p.lastAt),
        lastInboundAt: lastOf("inbound"),
        lastOutboundAt: lastOf("outbound"),
        closedAt: status === "closed" ? iso(p.lastAt) : null,
        createdAt: iso(p.firstAt),
      })
    }

    for (const m of p.messages) {
      messageN += 1
      const text = decodeEntities(m.meta.snippet ?? "")
      messages.push({
        id: `message-${messageN}`,
        threadId,
        caseId,
        triageState: caseId ? null : p.inInbox ? "pending" : "ignored",
        direction: m.direction,
        fromEmail: clamp(m.from.email, CRM_LIMITS.email),
        fromName: clampName(m.from.name),
        toEmails: m.to.map((a) => a.email).filter((e) => e.length <= CRM_LIMITS.email),
        subject: clamp(m.meta.headers.subject ?? "", CRM_LIMITS.subject) || "(no subject)",
        snippet: clamp(text, CRM_LIMITS.snippet),
        bodyText: clamp(text, CRM_LIMITS.body),
        bodyHtml: null,
        attachments: [],
        sentAt: iso(m.at),
      })
    }
  }

  return {
    organizations: [...organizations.values()],
    contacts: [...contacts.values()],
    cases,
    messages,
  }
}
