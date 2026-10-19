import "server-only"

import {
  fromSentry,
  fromWorkboard,
  mergeInbox,
  type InboxResponse,
  type InboxSourceState,
} from "@/lib/inbox-sources"
import { sentryService, type SentryService } from "@/lib/server/sentry"
import { workboardService, type WorkboardService } from "@/lib/server/workboard"

/**
 * The Inbox from its three sources, read side by side, each failing on its
 * own. GitHub comes through the workboard's cache (no second set of GitHub
 * calls); Sentry has its own; Gmail is a stub until #46.
 */

/** Gmail: Not connected until the read-only Gmail source (#46) lands. */
export function gmailInbox(): InboxSourceState {
  return { status: "not_connected", fetchedAt: null }
}

export async function readInbox({
  workboard = workboardService,
  sentry = sentryService,
  now = () => new Date(),
}: { workboard?: WorkboardService; sentry?: SentryService; now?: () => Date } = {}): Promise<InboxResponse> {
  const at = now()
  const [board, issues] = await Promise.all([
    workboard.read().catch(() => null),
    Promise.resolve()
      .then(() => sentry.read())
      .catch(() => null),
  ])

  const github: InboxSourceState = board?.connected
    ? { status: board.stale ? "stale" : "connected", fetchedAt: board.fetchedAt }
    : { status: workboard.connecting() ? "connecting" : "not_connected", fetchedAt: null }
  const sentryState: InboxSourceState = issues
    ? { status: issues.status, fetchedAt: issues.fetchedAt }
    : { status: "not_connected", fetchedAt: null }

  return {
    fetchedAt: at.toISOString(),
    sources: { github, sentry: sentryState, gmail: gmailInbox() },
    items: mergeInbox(board?.connected ? fromWorkboard(board.items) : [], issues ? fromSentry(issues.issues, at) : []),
  }
}

export function inboxSettled({
  workboard = workboardService,
  sentry = sentryService,
}: { workboard?: WorkboardService; sentry?: SentryService } = {}) {
  return Promise.all([workboard.settled(), sentry.settled()]).then(() => undefined)
}
