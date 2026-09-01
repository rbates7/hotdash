import sanitizeHtml from "sanitize-html"

import { normalizeEmail } from "@/lib/crm/contacts/matching"

import type {
  GmailHeader,
  GmailMessagePart,
  GmailRawMessage,
  ParsedAttachment,
  ParsedMessage,
} from "./types"

export type Address = { name: string | null; email: string }

// Handles "Name <a@b.c>", bare addresses, quoted names with commas, and
// comma-separated lists of any of those.
export function parseAddressList(value: string | null | undefined): Address[] {
  if (!value) return []
  const results: Address[] = []
  const pattern = /(?:"([^"]*)"|([^<>,]*?))?\s*<([^<>\s]+@[^<>\s]+)>|([^\s<>,"]+@[^\s<>,"]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const email = match[3] ?? match[4]
    if (!email) continue
    const rawName = (match[1] ?? match[2] ?? "").trim()
    results.push({
      name: rawName || null,
      email: normalizeEmail(email),
    })
  }
  return results
}

function headerMap(headers: GmailHeader[] | null | undefined) {
  const map = new Map<string, string>()
  for (const header of headers ?? []) {
    if (header.name && header.value != null && !map.has(header.name.toLowerCase())) {
      map.set(header.name.toLowerCase(), header.value)
    }
  }
  return map
}

// Words that mean "machine" wherever they appear in the local part.
// `payments-noreply@google.com` is not a person, and anchoring this to the
// start of the address (as it once was) let every prefixed variant through.
const BULK_ANYWHERE = /no-?reply|do-?not-?reply|mailer-?daemon|postmaster/i

// Words that only mean "machine" as a whole segment. `news@` is a newsletter;
// a coach named Newsome is not, so these must not match as substrings.
//
// "submission" is deliberately absent. A contact form is the one machine
// sender relaying a person who wants an answer, and when the relay cannot be
// seen through (below) the message must still surface in triage. A lead that
// looks ugly can be fixed; one that was silently dropped cannot be noticed.
const BULK_SEGMENTS = new Set([
  "alert",
  "alerts",
  "automated",
  "bounce",
  "bounces",
  "mailer",
  "marketing",
  "news",
  "newsletter",
  "notification",
  "notifications",
  "update",
  "updates",
])

function localPart(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? ""
}

function isBulkSender(fromEmail: string): boolean {
  const local = localPart(fromEmail)
  if (BULK_ANYWHERE.test(local)) return true
  return local.split(/[.\-_+]/).some((segment) => BULK_SEGMENTS.has(segment))
}

// Addresses that speak on someone else's behalf. Broader than the bulk list
// on purpose, and kept separate from it: a contact form is a relay but is not
// bulk, so it must be looked through here without ever becoming droppable
// there.
const RELAY_SEGMENTS = new Set([
  "form",
  "forms",
  "submission",
  "submissions",
  "webform",
])

function isRelaySender(fromEmail: string): boolean {
  if (isBulkSender(fromEmail)) return true
  return localPart(fromEmail)
    .split(/[.\-_+]/)
    .some((segment) => RELAY_SEGMENTS.has(segment))
}

// Gmail's own categorisation, which is better at recognising marketing than
// any pattern we could write. Deliberately excludes CATEGORY_UPDATES: real
// first-contact mail from a coach lands there often enough that dropping it
// would lose actual support requests.
const BULK_CATEGORIES = new Set([
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
])

// A contact-form notification is addressed *from* the form host — Squarespace,
// Typeform, a website's own mailer — while the person who actually wrote it is
// named inside. Taken at face value these look like machine mail, so they get
// dropped, and taken at face value in triage they would create a contact named
// "Squarespace". Neither is what the message is: it is a coach asking for help.
const BODY_EMAIL_LABEL =
  /^[ \t>*]*(?:your[ \t]+)?e-?mail(?:[ \t]+address)?[ \t]*[:*]+[ \t]*<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@,;)]+)/im
const BODY_NAME_LABEL =
  /^[ \t>*]*(?:your[ \t]+)?(?:full[ \t]+)?name[ \t]*[:*]+[ \t]*(\S.{0,80}?)[ \t]*$/im

function isListMail(headers: Map<string, string>): boolean {
  if (headers.has("list-unsubscribe") || headers.has("list-id")) return true
  const precedence = headers.get("precedence")?.trim().toLowerCase()
  return precedence === "bulk" || precedence === "list" || precedence === "junk"
}

/**
 * The human behind a relayed message, or null if this is not a relay.
 *
 * Deliberately narrow: only mail that already looks machine-sent, and never
 * list mail — a newsletter with a friendly Reply-To is still a newsletter.
 * The candidate must not itself look automated, so a `noreply@` bouncing to
 * `support-noreply@` stays bulk.
 */
export function resolveRelaySender(
  headers: Map<string, string>,
  from: Address,
  bodyText: string | null
): Address | null {
  if (!isRelaySender(from.email)) return null
  if (isListMail(headers)) return null

  const bodyName = bodyText?.match(BODY_NAME_LABEL)?.[1]?.trim() || null

  const replyTo = parseAddressList(headers.get("reply-to"))[0]
  if (
    replyTo &&
    replyTo.email !== from.email &&
    !isBulkSender(replyTo.email)
  ) {
    return { email: replyTo.email, name: replyTo.name ?? bodyName }
  }

  const bodyEmail = bodyText?.match(BODY_EMAIL_LABEL)?.[1]
  if (bodyEmail) {
    const email = normalizeEmail(bodyEmail)
    if (email !== from.email && !isBulkSender(email)) {
      return { email, name: bodyName }
    }
  }
  return null
}

// Bulk/automated mail announces itself via headers; real humans never set
// List-Unsubscribe or Precedence: bulk. Known contacts bypass this check, so
// a customer whose mail Gmail files under Promotions still opens a case.
export function isBulk(
  headers: Map<string, string>,
  fromEmail: string,
  labelIds: string[] = []
): boolean {
  if (headers.has("list-unsubscribe") || headers.has("list-id")) return true
  const precedence = headers.get("precedence")?.trim().toLowerCase()
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") {
    return true
  }
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== "no") return true
  if (labelIds.some((label) => BULK_CATEGORIES.has(label))) return true
  return isBulkSender(fromEmail)
}

function decodeBody(data: string | null | undefined): string | null {
  if (!data) return null
  try {
    return Buffer.from(data, "base64url").toString("utf8")
  } catch {
    return null
  }
}

function collectBodies(part: GmailMessagePart | null | undefined): {
  text: string | null
  html: string | null
  attachments: ParsedAttachment[]
} {
  let text: string | null = null
  let html: string | null = null
  const attachments: ParsedAttachment[] = []

  const walk = (node: GmailMessagePart | null | undefined) => {
    if (!node) return
    if (node.filename) {
      attachments.push({
        filename: node.filename,
        mimeType: node.mimeType ?? "application/octet-stream",
        size: node.body?.size ?? 0,
      })
    } else if (node.mimeType === "text/plain" && !text) {
      text = decodeBody(node.body?.data)
    } else if (node.mimeType === "text/html" && !html) {
      html = decodeBody(node.body?.data)
    }
    for (const child of node.parts ?? []) walk(child)
  }
  walk(part)
  return { text, html, attachments }
}

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags.filter((t) => t !== "iframe"),
      "img",
      "h1",
      "h2",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !frame.attribs["src"],
  })
}

export function parseMessage(
  raw: GmailRawMessage,
  founderAddresses: Set<string>
): ParsedMessage | null {
  if (!raw.id || !raw.threadId || !raw.payload) return null
  const headers = headerMap(raw.payload.headers)

  const from = parseAddressList(headers.get("from"))[0]
  if (!from) return null
  const toAddresses = parseAddressList(headers.get("to"))
  const ccAddresses = parseAddressList(headers.get("cc"))

  const { text, html, attachments } = collectBodies(raw.payload)

  // Direction is judged on the true From: a relay is never the founder.
  const direction = founderAddresses.has(from.email) ? "outbound" : "inbound"
  // ...but everything downstream — contact matching, the ignore list, who
  // triage offers to promote — keys off the sender, so a relayed message has
  // to name the person, not the postman.
  const relaySender =
    direction === "inbound" ? resolveRelaySender(headers, from, text) : null
  const sender = relaySender ?? from

  let counterparty: Address | null
  if (direction === "inbound") {
    counterparty = sender
  } else {
    counterparty =
      [...toAddresses, ...ccAddresses].find(
        (address) => !founderAddresses.has(address.email)
      ) ?? null
  }

  const sentAtMs = Number(raw.internalDate)
  const dateHeader = headers.get("date")
  const sentAt = Number.isFinite(sentAtMs)
    ? new Date(sentAtMs)
    : dateHeader
      ? new Date(dateHeader)
      : new Date()

  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    direction,
    fromEmail: sender.email,
    fromName: sender.name,
    toEmails: toAddresses.map((a) => a.email),
    ccEmails: ccAddresses.map((a) => a.email),
    counterpartyEmail: counterparty?.email ?? null,
    counterpartyName: counterparty?.name ?? null,
    subject: headers.get("subject") ?? null,
    snippet: raw.snippet ?? null,
    bodyText: text,
    bodyHtml: html ? sanitizeEmailHtml(html) : null,
    attachments,
    sentAt,
    // A resolved relay is a person writing in, never bulk.
    isBulk:
      direction === "inbound" &&
      !relaySender &&
      isBulk(headers, from.email, raw.labelIds ?? []),
  }
}

const EXCLUDED_LABELS = new Set(["SPAM", "TRASH", "DRAFT", "CHAT"])

export function isExcludedByLabels(labelIds: string[] | null | undefined) {
  return (labelIds ?? []).some((label) => EXCLUDED_LABELS.has(label))
}
