import sanitizeHtml from "sanitize-html"

import { normalizeEmail } from "@/lib/contacts/matching"

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

const BULK_FROM_PATTERN =
  /^(no-?reply|do-?not-?reply|notifications?|updates?|newsletter|news|marketing|mailer(-daemon)?|bounce[s]?)@/i

// Bulk/automated mail announces itself via headers; real humans never set
// List-Unsubscribe or Precedence: bulk. Known contacts bypass this check.
export function isBulk(
  headers: Map<string, string>,
  fromEmail: string
): boolean {
  if (headers.has("list-unsubscribe") || headers.has("list-id")) return true
  const precedence = headers.get("precedence")?.trim().toLowerCase()
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") {
    return true
  }
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== "no") return true
  return BULK_FROM_PATTERN.test(fromEmail)
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

  const direction = founderAddresses.has(from.email) ? "outbound" : "inbound"
  let counterparty: Address | null
  if (direction === "inbound") {
    counterparty = from
  } else {
    counterparty =
      [...toAddresses, ...ccAddresses].find(
        (address) => !founderAddresses.has(address.email)
      ) ?? null
  }

  const { text, html, attachments } = collectBodies(raw.payload)
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
    fromEmail: from.email,
    fromName: from.name,
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
    isBulk: direction === "inbound" && isBulk(headers, from.email),
  }
}

const EXCLUDED_LABELS = new Set(["SPAM", "TRASH", "DRAFT", "CHAT"])

export function isExcludedByLabels(labelIds: string[] | null | undefined) {
  return (labelIds ?? []).some((label) => EXCLUDED_LABELS.has(label))
}
