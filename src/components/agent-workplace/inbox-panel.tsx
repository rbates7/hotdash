"use client"

import { formatRelative, now as clockNow } from "@/lib/clock"
import { SOURCE_LABEL, inboxScreen, sourceList } from "@/lib/inbox-sources"
import { cn } from "@/lib/utils"
import { useInboxView } from "@/hooks/use-inbox"
import { useSettings } from "@/hooks/use-settings"
import { useWallClock } from "@/hooks/use-wall-clock"
import { Skeleton } from "@/components/ui/skeleton"

const BOX = "bg-surface border-surface-border max-w-[1100px] rounded-xl border"
const MESSAGE = cn(BOX, "text-label text-muted-foreground px-[18px] py-6 text-center")

/**
 * The founder's Inbox, live from `/api/inbox` (every row, informational
 * ones included; Home's Needs you shows only the ones that need him): PRs ready for review or
 * needing a fix (GitHub, through the workboard) and Sentry issues. Gmail is
 * not wired in yet and says so. Never sample rows: until a source answers
 * it reads Connecting… or Not connected, and with nothing waiting it says
 * so.
 */
export function InboxPanel() {
  const { timeZone } = useSettings()
  const screen = inboxScreen(useInboxView(), timeZone)
  // Re-render every minute so row ages move; the instant is the browser's.
  useWallClock(timeZone)
  const now = clockNow().getTime()
  const { status, items } = screen
  const connectingBox = status === "connecting" && items.length === 0
  // The box below already says "Connecting to …": don't repeat it per source
  // in the header (other notes, like "Gmail: Not connected", stay).
  const notes = connectingBox
    ? screen.notes.filter((note) => !screen.connecting.some((label) => note === `${label}: Connecting…`))
    : screen.notes

  return (
    <div className="flex flex-col gap-3" data-testid="inbox-panel" data-state={status}>
      <div className="text-caption text-muted-foreground -mt-1 flex flex-wrap gap-x-3 gap-y-1 tracking-tight">
        <span>Absorbs Home &ldquo;Needs you.&rdquo; Founder-only.</span>
        {screen.stale.length > 0 ? <span data-testid="inbox-updated">{screen.stale.join(" · ")}</span> : null}
        {status !== "loading" && status !== "not_connected"
          ? notes.map((note) => (
              <span key={note} data-testid="inbox-source-note">
                {note}
              </span>
            ))
          : null}
      </div>
      {status === "loading" || connectingBox ? (
        <div
          aria-busy="true"
          aria-label={status === "loading" ? "Loading the Inbox" : `Connecting to ${sourceList(screen.connecting)}`}
          className={cn(BOX, "flex flex-col gap-3 px-[18px] py-4")}
        >
          {status === "connecting" ? (
            <p className="text-label text-muted-foreground tracking-tight">
              Connecting to {sourceList(screen.connecting)}…
            </p>
          ) : null}
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex items-start gap-3">
              <Skeleton className="mt-1.5 size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : status === "not_connected" && items.length === 0 ? (
        <div className={MESSAGE} data-testid="inbox-not-connected">
          <p className="text-foreground font-semibold tracking-tight">Not connected</p>
          <p className="text-caption mt-1 tracking-tight">
            GitHub, Sentry and Gmail aren&rsquo;t connected yet, so there&rsquo;s nothing to show.
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className={MESSAGE} data-testid="inbox-empty">
          Nothing in the Inbox.
        </p>
      ) : (
        <ul aria-label="Inbox" className={cn(BOX, "overflow-hidden")}>
          {items.map((item) => (
            <li key={item.id} className="border-border border-b last:border-b-0">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-surface-hover focus-visible:ring-ring/50 flex w-full items-start gap-3 px-[18px] py-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    item.unread ? "bg-success" : "ring-surface-border bg-transparent ring-1 ring-inset"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-label block leading-[1.35] font-semibold tracking-tight">
                    {item.title}
                  </span>
                  <span className="text-caption text-muted-foreground mt-[3px] block leading-[1.4] break-words">
                    {SOURCE_LABEL[item.source]} · {item.snippet}
                  </span>
                </span>
                <span className="text-micro text-muted-foreground shrink-0 pt-0.5 font-medium whitespace-nowrap">
                  {formatRelative(Date.parse(item.at), now, { style: "compact" })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
