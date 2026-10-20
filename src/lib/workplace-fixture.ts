/**
 * The shape of an Inbox row. The Inbox itself is live (`/api/inbox`, see
 * `@/lib/inbox-sources`); its old sample rows live only in
 * `@/test/inbox-fixture` for unit tests. The Autopilots tab has no rows:
 * no scheduler is connected, so it says Not connected.
 */

export type InboxItem = {
  id: string
  title: string
  snippet: string
  /** ISO instant the row arrived. Shown as an age via `formatAge`. */
  at: string
  /** Lit dot = needs the founder; off = informational. */
  unread: boolean
  dismissed?: boolean
  /** Opens the ticket when set. */
  issueKey?: string
}
