// Raw shapes mirror gmail_v1.Schema$Message (format: "full") but stay
// self-defined so the sync/parse layer is testable against fixtures without
// importing the SDK.

export type GmailHeader = { name?: string | null; value?: string | null }

export type GmailMessagePart = {
  partId?: string | null
  mimeType?: string | null
  filename?: string | null
  headers?: GmailHeader[] | null
  body?: {
    size?: number | null
    data?: string | null
    attachmentId?: string | null
  } | null
  parts?: GmailMessagePart[] | null
}

export type GmailRawMessage = {
  id?: string | null
  threadId?: string | null
  labelIds?: string[] | null
  snippet?: string | null
  internalDate?: string | null
  payload?: GmailMessagePart | null
}

export type ParsedAttachment = {
  filename: string
  mimeType: string
  size: number
}

export type ParsedMessage = {
  gmailMessageId: string
  gmailThreadId: string
  labelIds: string[]
  direction: "inbound" | "outbound"
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]
  counterpartyEmail: string | null
  counterpartyName: string | null
  subject: string | null
  snippet: string | null
  bodyText: string | null
  bodyHtml: string | null
  attachments: ParsedAttachment[]
  sentAt: Date
  isBulk: boolean
}

// Narrow surface the sync algorithm needs; the real implementation wraps
// @googleapis/gmail, tests inject a fixture-backed fake.
export interface GmailApi {
  getProfile(): Promise<{ emailAddress: string; historyId: string }>
  listMessageIds(params: {
    q: string
    pageToken?: string
  }): Promise<{ ids: string[]; nextPageToken?: string }>
  getMessage(id: string): Promise<GmailRawMessage>
  listHistory(params: {
    startHistoryId: string
    pageToken?: string
  }): Promise<{
    historyId: string | null
    messageIds: string[]
    nextPageToken?: string
  }>
  getThread(threadId: string): Promise<{ messages: GmailRawMessage[] }>
}

export class HistoryExpiredError extends Error {
  constructor() {
    super("Gmail history cursor expired.")
    this.name = "HistoryExpiredError"
  }
}

/**
 * Enabling the Gmail API is a separate step from creating the OAuth client,
 * and it is the one people miss. Google reports it as a plain 403 during the
 * first API call — i.e. *after* a completely successful sign-in — so without
 * this distinction it surfaces as "authorization failed, check your
 * credentials" and sends you to audit values that are already correct.
 */
export class GmailApiDisabledError extends Error {
  constructor() {
    super("Gmail API is not enabled for this Google Cloud project.")
    this.name = "GmailApiDisabledError"
  }
}

export class ReconnectRequiredError extends Error {
  constructor() {
    super("Google authorization expired — reconnect Google in Settings.")
    this.name = "ReconnectRequiredError"
  }
}

export type GmailSyncStats = {
  fetched: number
  stored: number
  casesCreated: number
  triaged: number
  skippedBulk: number
  backfilled: number
}
