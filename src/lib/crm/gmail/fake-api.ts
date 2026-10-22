// Fixture-backed GmailApi used by the sync tests (kept out of __fixtures__
// so it can hold behavior, not data).

import type { GmailApi, GmailRawMessage } from "./types"
import { HistoryExpiredError } from "./types"

export class FakeGmailApi implements GmailApi {
  private messages = new Map<string, GmailRawMessage>()
  historyId = "1000"
  emailAddress: string
  historyBatches: { historyId: string; ids: string[] }[] = []
  expireHistoryOnce = false
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

  async listMessageIds() {
    this.calls.listMessageIds += 1
    return { ids: [...this.messages.keys()] }
  }

  async getMessage(id: string) {
    const message = this.messages.get(id)
    if (!message) throw new Error(`Unknown message ${id}`)
    return message
  }

  async listHistory({ startHistoryId }: { startHistoryId: string }) {
    this.calls.listHistory += 1
    if (this.expireHistoryOnce) {
      this.expireHistoryOnce = false
      throw new HistoryExpiredError()
    }
    const ids = this.historyBatches
      .filter((batch) => Number(batch.historyId) > Number(startHistoryId))
      .flatMap((batch) => batch.ids)
    return { historyId: this.historyId, messageIds: ids }
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
