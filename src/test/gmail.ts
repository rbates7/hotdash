import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import type { GmailSummary } from "@/lib/crm/gmail-summary"

export { gmailFixtureThreads, liveGmailSummary } from "@/test/gmail-fixture"

/** Start the Gmail store on `summary` (and keep answering it). */
export function setGmailSummaryForTest(summary: GmailSummary) {
  configureGmailSummary({ initial: { phase: "ready", summary }, fetcher: async () => summary })
}

/** Start the Gmail store loading, with an answer that never arrives. */
export function setGmailLoadingForTest() {
  configureGmailSummary({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}
