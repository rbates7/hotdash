import { contactDisplayName } from "@/lib/crm/crm"
import type { CrmLiveData } from "@/lib/crm/gmail-summary"
import {
  createIdRegistry,
  decodeEntities,
  mapGmailThreads,
  parseAddressList,
  type Address,
  type GmailThreadMeta,
  type IdRegistry,
} from "@/lib/crm/gmail-mapping"
import { normalizeEmail } from "@/lib/crm/matching"
import type {
  CrmAccount,
  CrmActivity,
  CrmAttachment,
  CrmCase,
  CrmCaseStatus,
  CrmCounts,
  CrmMessage,
  CrmPerson,
} from "@/lib/crm/types"

/**
 * Gmail threads (metadata) into the CRM screen's contract
 * (`src/lib/crm/types.ts`). Pure: unit-tested without Gmail. Rules are in
 * docs/crm-gmail-data.md.
 */

const HOUR = 3_600_000
const WEEK = 7 * 24 * HOUR
export const URGENT_AFTER_MS = 24 * HOUR
export const MAX_ACTIVITY = 50
const SYSTEM_LABELS: Record<string, string> = {
  INBOX: "inbox",
  STARRED: "starred",
  IMPORTANT: "important",
  UNREAD: "unread",
  SENT: "sent",
}

const iso = (ms: number) => new Date(ms).toISOString()
const person = (a: Address): CrmPerson => ({ name: a.name, email: a.email })

export type CrmListView = {
  counts: CrmCounts
  cases: CrmCase[]
  accounts: CrmAccount[]
  recentActivity: CrmActivity[]
}

export function emptyCrmList(): CrmListView {
  return { counts: { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 }, cases: [], accounts: [], recentActivity: [] }
}

export function buildCrmList(
  threads: readonly GmailThreadMeta[],
  {
    mailbox,
    ids = createIdRegistry(),
    nowMs,
    data = mapGmailThreads(threads, { mailbox, ids }),
  }: { mailbox: string; ids?: IdRegistry; nowMs: number; data?: CrmLiveData }
): CrmListView {
  const me = normalizeEmail(mailbox)
  // peek, never number: a skipped thread must not take a number (it would shift later case numbers).
  const metaByThread = new Map(
    threads.flatMap((t) => {
      const n = ids.peek("thread", t.id)
      return n === undefined ? [] : [[`thread-${n}` as string, t] as const]
    })
  )
  const contacts = new Map(data.contacts.map((c) => [c.id, c]))
  const orgs = new Map(data.organizations.map((o) => [o.id, o]))

  const cases: CrmCase[] = []
  const activity: CrmActivity[] = []
  for (const c of data.cases) {
    const threadId = `thread-${c.caseNumber}`
    const msgs = data.messages.filter((m) => m.caseId === c.id).sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
    const last = msgs[msgs.length - 1]
    const contact = contacts.get(c.contactId)
    if (!last || !contact) continue
    const meta = metaByThread.get(threadId)
    const live = (meta?.messages ?? []).filter((m) => !m.labelIds.includes("DRAFT"))
    const labelSet = new Set<string>()
    for (const m of live) for (const l of m.labelIds) if (SYSTEM_LABELS[l]) labelSet.add(SYSTEM_LABELS[l]!)

    let status: CrmCaseStatus
    let waitingOnUsSince: string | null = null
    if (c.status === "closed") status = "closed"
    else if (last.direction === "inbound") {
      status = "waiting_on_us"
      let i = msgs.length - 1
      while (i > 0 && msgs[i - 1]!.direction === "inbound") i -= 1
      waitingOnUsSince = msgs[i]!.sentAt
    } else status = "waiting_on_them"

    const starred = labelSet.has("starred")
    const priority =
      starred && waitingOnUsSince && nowMs - Date.parse(waitingOnUsSince) > URGENT_AFTER_MS ? "urgent" : starred ? "high" : "normal"

    const name = contact.firstName || contact.lastName ? contactDisplayName(contact) : null
    const contactPerson: CrmPerson = { name, email: contact.email }
    cases.push({
      id: c.id,
      threadId,
      subject: c.subject,
      accountId: contact.organizationId,
      contact: contactPerson,
      status,
      priority,
      waitingOnUsSince,
      lastMessageAt: last.sentAt,
      lastMessageSnippet: last.snippet,
      messageCount: msgs.length,
      unread: labelSet.has("unread"),
      labels: [...labelSet].sort(),
    })
    for (const m of msgs) {
      activity.push({
        type: m.direction === "inbound" ? "received" : "sent",
        caseId: c.id,
        at: m.sentAt,
        actor: m.direction === "inbound" ? { name: m.fromName, email: m.fromEmail } : { name: null, email: me },
      })
    }
  }
  cases.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))

  const accounts: CrmAccount[] = []
  for (const org of orgs.values()) {
    const mine = cases.filter((c) => c.accountId === org.id)
    const people = data.contacts
      .filter((c) => c.organizationId === org.id)
      .map((c) => ({ name: c.firstName || c.lastName ? contactDisplayName(c) : null, email: c.email }))
    const lastAt = mine.reduce<string | null>((acc, c) => (!acc || c.lastMessageAt > acc ? c.lastMessageAt : acc), null)
    accounts.push({
      id: org.id,
      name: org.name,
      domain: org.domain ?? org.name,
      contacts: people,
      openCases: mine.filter((c) => c.status !== "closed").length,
      waitingOnUsCount: mine.filter((c) => c.status === "waiting_on_us").length,
      lastActivityAt: lastAt,
    })
  }
  accounts.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))

  const counts: CrmCounts = {
    open: cases.filter((c) => c.status !== "closed").length,
    waitingOnUs: cases.filter((c) => c.status === "waiting_on_us").length,
    waitingOnThem: cases.filter((c) => c.status === "waiting_on_them").length,
    closedThisWeek: cases.filter((c) => c.status === "closed" && nowMs - Date.parse(c.lastMessageAt) <= WEEK).length,
  }
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return { counts, cases, accounts, recentActivity: activity.slice(0, MAX_ACTIVITY) }
}

/* ---------------------------------------------------- one full thread */

type Part = {
  mimeType?: unknown
  filename?: unknown
  headers?: unknown
  body?: { data?: unknown; size?: unknown; attachmentId?: unknown }
  parts?: unknown
}

export const MAX_BODY_CHARS = 200_000

function b64url(data: string) {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  } catch {
    return ""
  }
}

function headerOf(part: Part, name: string): string | null {
  if (!Array.isArray(part.headers)) return null
  const h = (part.headers as Array<{ name?: unknown; value?: unknown }>).find(
    (x) => typeof x?.name === "string" && x.name.toLowerCase() === name
  )
  return typeof h?.value === "string" ? h.value : null
}

function walk(part: Part, out: { text: string | null; html: string | null; attachments: CrmAttachment[] }) {
  const mime = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : ""
  const filename = typeof part.filename === "string" ? part.filename : ""
  const data = typeof part.body?.data === "string" ? part.body.data : null
  if (filename || typeof part.body?.attachmentId === "string") {
    out.attachments.push({
      name: filename || "attachment",
      size: typeof part.body?.size === "number" ? part.body.size : 0,
      mimeType: mime || "application/octet-stream",
    })
  } else if (data && mime === "text/plain" && out.text === null) out.text = b64url(data)
  else if (data && mime === "text/html" && out.html === null) out.html = b64url(data)
  if (Array.isArray(part.parts)) for (const p of part.parts as Part[]) if (p && typeof p === "object") walk(p, out)
}

/** Elements whose content is code, not text. */
const BLOCKS = /<(script|style|head|title|noscript|template)\b[\s\S]*?(<\/\1\s*>|$)/gi

/** Anything tag-like (incl. comments), so no markup survives into text. */
const TAG = /<!--[\s\S]*?(-->|$)|<\/?[a-z!?][^>]*(>|$)/gi

/** Text with every tag removed; entity-decoded text is stripped again. */
export function stripTags(text: string) {
  let out = text.replace(BLOCKS, "")
  for (let i = 0; i < 3 && TAG.test(out); i++) out = out.replace(TAG, "")
  return out.replace(TAG, "")
}

export function htmlToText(html: string) {
  return stripTags(
    decodeEntities(
      html
        .replace(BLOCKS, "")
        .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
        .replace(TAG, "")
    )
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * A `threads.get?format=full` answer into messages, oldest first. Drafts
 * are skipped. Attachment bytes are never read.
 */
export function parseFullThread(raw: unknown, { mailbox, threadId }: { mailbox: string; threadId: string }): CrmMessage[] {
  const me = normalizeEmail(mailbox)
  const t = raw as { messages?: unknown } | null
  if (!t || !Array.isArray(t.messages)) return []
  const out: Array<CrmMessage & { at: number }> = []
  for (const m of t.messages as Array<{ labelIds?: unknown; internalDate?: unknown; snippet?: unknown; payload?: Part }>) {
    const labels = Array.isArray(m?.labelIds) ? (m.labelIds as unknown[]) : []
    if (labels.includes("DRAFT")) continue
    const at = Number(m?.internalDate)
    if (!Number.isFinite(at) || at <= 0) continue
    const payload: Part = m.payload && typeof m.payload === "object" ? m.payload : {}
    const from = parseAddressList(headerOf(payload, "from"))[0] ?? { email: me, name: null }
    const body = { text: null as string | null, html: null as string | null, attachments: [] as CrmAttachment[] }
    walk(payload, body)
    const html = body.html ? body.html.slice(0, MAX_BODY_CHARS) : null
    const text = stripTags(
      body.text?.trim() || (html ? htmlToText(html) : "") || decodeEntities(typeof m.snippet === "string" ? m.snippet : "")
    ).trim()
    out.push({
      at,
      id: "",
      threadId,
      direction: labels.includes("SENT") || from.email === me ? "outbound" : "inbound",
      from: person(from),
      to: parseAddressList(headerOf(payload, "to")).map(person),
      cc: parseAddressList(headerOf(payload, "cc")).map(person),
      sentAt: iso(at),
      bodyText: text.slice(0, MAX_BODY_CHARS),
      attachments: body.attachments,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return out.sort((a, b) => a.at - b.at).map(({ at: _at, ...m }, i) => ({ ...m, id: `${threadId}-m${i + 1}` }))
}
