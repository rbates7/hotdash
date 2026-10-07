import type { Issue } from "@/lib/issues"
import type { InboxItem } from "@/lib/workplace-fixture"

/**
 * The Inbox rows that are still live: everything except rows whose ticket
 * has since been closed on the board or no longer exists. Rows without a
 * ticket (digests) always stay.
 *
 * This is the one place that rule lives. Home's "Needs you" and the
 * Workplace Inbox tab both go through it, so Home can never say "Nothing
 * needs you" while the Inbox still lists the same tickets.
 */
export function openInboxItems(inbox: InboxItem[], issues: Issue[]): InboxItem[] {
  return inbox.filter((item) => {
    if (!item.issueKey) return true
    const issue = issues.find((i) => i.key === item.issueKey)
    return issue !== undefined && issue.status !== "done"
  })
}

/** Open rows the founder has not dismissed — the ones that still want a decision. */
export function pendingInboxItems(inbox: InboxItem[], issues: Issue[]): InboxItem[] {
  return openInboxItems(inbox, issues).filter((item) => !item.dismissed)
}
