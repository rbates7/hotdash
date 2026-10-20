"use client"

import { ExternalLinkIcon } from "lucide-react"

import { formatRelative, now as clockNow } from "@/lib/clock"
import { sentryBugs } from "@/lib/bugs"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import { useInboxView } from "@/hooks/use-inbox"
import { useSettings } from "@/hooks/use-settings"
import { useWallClock } from "@/hooks/use-wall-clock"
import { ConnectingBadge } from "@/components/connecting-badge"
import { NotConnectedPanel } from "@/components/not-connected-panel"
import { Skeleton } from "@/components/ui/skeleton"

export const SENTRY_CRASHES_TITLE = "Crashes and errors from Sentry"
export const SENTRY_HINT = "Unresolved crash and error issues in chlk-ios appear here once Sentry is connected."
export const SENTRY_EMPTY = "No unresolved crashes or errors in Sentry right now."

const BOX = "bg-surface border-surface-border overflow-hidden rounded-xl border"

/**
 * Sentry's unresolved crash and error issues, read from `/api/inbox` (the
 * same rows the Workplace Inbox shows). Never a fixture: before the first
 * answer it is a skeleton, while Sentry's first sync runs it says
 * Connecting…, with no token it is a Not connected panel, and connected
 * with nothing open it says so. Each row opens the issue in Sentry. When
 * Sentry's last sync failed (`stale`), the header says when the rows are
 * from ("Last updated …"), so an old list never reads as live.
 */
export function SentryCrashes() {
  const { timeZone } = useSettings()
  const { status, rows, staleSince } = sentryBugs(useInboxView())
  useWallClock(timeZone)
  const nowMs = clockNow().getTime()

  if (status === "not_connected") {
    return <NotConnectedPanel title={SENTRY_CRASHES_TITLE} hint={SENTRY_HINT} testId="sentry-not-connected" />
  }

  return (
    <section aria-label={SENTRY_CRASHES_TITLE} data-testid="sentry-crashes" data-state={status} className="flex min-w-0 flex-col gap-1.5">
      <header className="flex min-h-6 items-center gap-2 px-0.5">
        <h2 className="text-caption font-semibold tracking-tight">{SENTRY_CRASHES_TITLE}</h2>
        {status === "connecting" ? <ConnectingBadge className="h-5 px-2" /> : null}
        {status === "connected" || status === "stale" ? (
          <span className="text-micro text-muted-foreground bg-muted grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums">
            {rows.length}
          </span>
        ) : null}
        {staleSince ? (
          <span data-testid="sentry-stale" className="text-micro text-muted-foreground ml-auto font-medium">
            {lastUpdatedLabel(new Date(staleSince), timeZone)}
          </span>
        ) : null}
      </header>
      {status === "loading" || status === "connecting" ? (
        <div aria-busy="true" aria-label={status === "loading" ? "Loading Sentry issues" : "Connecting to Sentry"} className={`${BOX} flex flex-col gap-3 px-[18px] py-4`}>
          {status === "connecting" ? (
            <p className="text-label text-muted-foreground tracking-tight">Connecting to Sentry… first sync in progress.</p>
          ) : null}
          {[0, 1].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p role="status" className={`${BOX} text-label text-muted-foreground px-[18px] py-6 text-center tracking-tight`}>
          {SENTRY_EMPTY}
        </p>
      ) : (
        <ul className={BOX}>
          {rows.map((row) => (
            <li key={row.id} className="border-border border-b last:border-b-0">
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="hover:bg-surface-hover focus-visible:ring-ring/50 flex min-h-11 w-full items-start gap-3 px-[18px] py-3.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none max-xl:focus-visible:ring-inset max-md:px-4 max-md:py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-label block leading-[1.35] font-semibold tracking-tight">{row.title}</span>
                  <span className="text-caption text-muted-foreground mt-[3px] block leading-[1.4] break-words">
                    {row.snippet}
                  </span>
                </span>
                <span
                  data-testid="sentry-age"
                  className="text-micro text-muted-foreground shrink-0 pt-0.5 font-medium whitespace-nowrap"
                >
                  {formatRelative(Date.parse(row.at), nowMs)}
                </span>
                <ExternalLinkIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="sr-only"> (opens Sentry)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
