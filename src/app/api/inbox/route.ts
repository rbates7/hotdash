import { after } from "next/server"

import { INBOX_SOURCES, type InboxResponse } from "@/lib/inbox-sources"
import { inboxSettled, readInbox } from "@/lib/server/inbox"

// Per request, never at build: the build must not call GitHub or Sentry.
export const dynamic = "force-dynamic"

/**
 * The Inbox: `{ fetchedAt, sources, items }` (see `InboxResponse`). Each
 * source says `connecting`, `connected`, `stale` or `not_connected`; rows
 * with `unread: true` are what Home's "Needs you" shows. Never an error
 * body and never sample rows. Due syncs run after the response.
 */
export async function GET() {
  after(() => inboxSettled())
  const body: InboxResponse = await readInbox().catch(() => ({
    fetchedAt: new Date().toISOString(),
    sources: Object.fromEntries(
      INBOX_SOURCES.map((id) => [id, { status: "not_connected" as const, fetchedAt: null }])
    ) as InboxResponse["sources"],
    items: [],
  }))
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

export const maxDuration = 300
