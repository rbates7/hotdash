// Fixture-backed GmailApi used by the sync tests (kept out of __fixtures__
// so it can hold behavior, not data).

import type { GmailApi, GmailRawMessage } from "./types"
import { HistoryExpiredError } from "./types"

/**
 * Mirrors what a real gaxios 7 GaxiosError from users.messages.get looks like
 * for a message Gmail no longer has: `status` and `response.status` are 404
 * and the message is Google's "Requested entity was not found."
 */
export function gaxiosNotFoundError(url: string): Error {
  const error = new Error("Requested entity was not found.") as Error & {
    status: number
    code?: string | number
    config: unknown
    response: unknown
  }
  error.name = "GaxiosError"
  error.status = 404
  error.config = {
    url,
    method: "GET",
    headers: { Authorization: "Bearer test-access-token" },
  }
  error.response = {
    status: 404,
    statusText: "Not Found",
    data: {
      error: {
        code: 404,
        message: "Requested entity was not found.",
        errors: [
          {
            message: "Requested entity was not found.",
            domain: "global",
            reason: "notFound",
          },
        ],
        status: "NOT_FOUND",
      },
    },
  }
  return error
}

export class FakeGmailApi implements GmailApi {
  private messages = new Map<string, GmailRawMessage>()
  historyId = "1000"
  emailAddress: string
  historyBatches: { historyId: string; ids: string[] }[] = []
  expireHistoryOnce = false
  /** Ids history/listing still return though the message itself is gone. */
  deletedIds = new Set<string>()
  /** When set, listMessageIds pages its results this many ids at a time. */
  pageSize: number | undefined
  listQueries: string[] = []
  calls = { getProfile: 0, listMessageIds: 0, listHistory: 0, getThread: 0 }

  constructor(emailAddress: string, messages: GmailRawMessage[] = []) {
    this.emailAddress = emailAddress
    for (const message of messages) this.add(message)
  }

  add(message: GmailRawMessage) {
    this.messages.set(message.id!, message)
  }

  async getProfile() {
    this.calls.getProfile += 1
    return { emailAddress: this.emailAddress, historyId: this.historyId }
  }

  async listMessageIds({
    q,
    pageToken,
  }: {
    q: string
    pageToken?: string
  }): Promise<{ ids: string[]; nextPageToken?: string }> {
    this.calls.listMessageIds += 1
    this.listQueries.push(q)
    const all = [...this.messages.keys(), ...this.deletedIds]
    if (!this.pageSize) return { ids: all }
    const start = pageToken ? Number(pageToken) : 0
    const end = start + this.pageSize
    return {
      ids: all.slice(start, end),
      nextPageToken: end < all.length ? String(end) : undefined,
    }
  }

  async getMessage(id: string) {
    const message = this.messages.get(id)
    if (!message) {
      throw gaxiosNotFoundError(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
      )
    }
    return message
  }

  async listHistory({ startHistoryId }: { startHistoryId: string }) {
    this.calls.listHistory += 1
    if (this.expireHistoryOnce) {
      this.expireHistoryOnce = false
      throw new HistoryExpiredError()
    }
    const records = this.historyBatches
      .filter((batch) => Number(batch.historyId) > Number(startHistoryId))
      .sort((a, b) => Number(a.historyId) - Number(b.historyId))
      .map((batch) => ({ historyId: batch.historyId, messageIds: batch.ids }))
    return { historyId: this.historyId, records }
  }

  async getThread(threadId: string) {
    this.calls.getThread += 1
    return {
      messages: [...this.messages.values()].filter(
        (m) => m.threadId === threadId
      ),
    }
  }
}
