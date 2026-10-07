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

/**
 * Compact age for an Inbox row, as the mock writes it: "18m", "2h",
 * "Yesterday", then "3d". Measured from the page's instant, never a wall
 * clock, so the server and client agree.
 */
export function formatAge(at: string, now: Date) {
  const mins = Math.round((now.getTime() - Date.parse(at)) / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? "Yesterday" : `${days}d`
}
