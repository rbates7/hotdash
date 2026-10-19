"use client"

import { AlertTriangleIcon, MailIcon, MailXIcon } from "lucide-react"

import { formatWallClock } from "@/lib/clock"
import type { GmailFeed } from "@/lib/crm/gmail-summary"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import { cn } from "@/lib/utils"
import { useSettings } from "@/hooks/use-settings"
import { Badge } from "@/components/ui/badge"

export const GMAIL_NOT_CONNECTED_LABEL = "Gmail not connected"
export const GMAIL_LIVE_LABEL = "Live from Gmail"
/** Settings › Connected data's word for the same state. */
export const GMAIL_CONNECTING_LABEL = "Connecting…"
export const GMAIL_READ_ONLY_NOTE = "Read-only · edits here aren't saved"

const BADGE = "h-6 px-2"

/**
 * Where the CRM's rows come from, beside the page title — the same words
 * Settings › Connected data uses: not connected (the sample, labelled
 * beside it), live from the support inbox, or the last good copy when
 * Gmail could not be read. Connecting… while the server's first sync runs
 * (the rows stay skeletons, never the sample). Nothing while the first
 * answer is on its way.
 */
export function CrmSourceBadge({ feed, className }: { feed: GmailFeed; className?: string }) {
  const { timeZone } = useSettings()
  if (feed.kind === "loading" && feed.connecting) {
    return (
      <Badge
        variant="outline"
        aria-busy
        data-testid="crm-source"
        data-source="connecting"
        title="Gmail is connecting: the first sync is in progress."
        className={cn("text-muted-foreground!", BADGE, className)}
      >
        <MailIcon aria-hidden />
        {GMAIL_CONNECTING_LABEL}
      </Badge>
    )
  }
  if (feed.kind === "loading") return null
  if (feed.kind === "not_connected") {
    return (
      <Badge
        variant="outline"
        data-testid="crm-source"
        data-source="sample"
        title={`${feed.mailbox} is not connected, so the CRM shows sample conversations.`}
        className={cn("text-muted-foreground!", BADGE, className)}
      >
        <MailXIcon aria-hidden />
        {GMAIL_NOT_CONNECTED_LABEL}
      </Badge>
    )
  }
  if (feed.stale) {
    return (
      <Badge
        variant="outline"
        data-testid="crm-source"
        data-source="gmail"
        data-stale=""
        title={`Gmail could not be read just now, so these are ${feed.mailbox}'s last good threads.`}
        className={cn(BADGE, className)}
      >
        <AlertTriangleIcon aria-hidden className="text-danger-text" />
        {lastUpdatedLabel(feed.lastSyncedAt, timeZone)}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      data-testid="crm-source"
      data-source="gmail"
      title={`${feed.mailbox}, read-only · last synced ${formatWallClock(feed.lastSyncedAt, timeZone)}`}
      className={cn("bg-success/10 text-success-text border-transparent", BADGE, className)}
    >
      <MailIcon aria-hidden />
      {GMAIL_LIVE_LABEL}
    </Badge>
  )
}
