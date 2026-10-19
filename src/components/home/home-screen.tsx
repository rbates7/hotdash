"use client"

import { todayIn } from "@/lib/clock"
import { pulseLabel } from "@/lib/home"
import { kpiStripTitle, kpis } from "@/lib/home-fixture"
import { snapshotFor } from "@/lib/kpis"
import { liveKpis, liveMetric } from "@/lib/live-metrics"
import { useSettings } from "@/hooks/use-settings"
import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { useWallClock } from "@/hooks/use-wall-clock"
import { useIssues } from "@/components/agent-workplace/issues-store"
import { DevBoardDoor } from "@/components/home/dev-board-door"
import { KpiStrip } from "@/components/home/kpi-strip"
import { MetricsDoor } from "@/components/home/metrics-door"
import { NeedsYouDoor } from "@/components/home/needs-you-door"
import { NumberOneStrip } from "@/components/home/number-one-strip"
import { SubscriberTicker } from "@/components/home/subscriber-ticker"
import {
  HOME_DOORS,
  HOME_HEADER,
  HOME_HEADER_TOP,
  HOME_INBOX_DOOR,
  HOME_TICKER,
  HOME_TITLE,
} from "@/components/home/responsive"

/**
 * The founder's pulse for the day: one thing, four numbers, three doors.
 * No sample data: a card with no real source shows Not connected or its
 * honest empty state. Sits inside an IssuesProvider for the page's instant.
 */
export function HomeScreen() {
  const { now } = useIssues()
  // The weekday and the clock read in the founder's Settings zone (Central
  // until the browser's copy is read, so the server HTML hydrates cleanly).
  const { timeZone } = useSettings()
  const pulse = pulseLabel(now, timeZone)
  const clock = useWallClock(timeZone)
  // The page's instant, as the founder's calendar day: the same `today` the
  // Metrics page would compute, so the strip and door match it.
  const today = todayIn(now)
  // Stripe's figures where it feeds them; every other card says Not
  // connected. No sample numbers, rows or priorities on Home.
  const feed = useStripeFeed()
  // #50's connecting state comes through liveKpis / liveMetric: a Stripe
  // card whose source has a key and is on its first sync (or Subscribers,
  // while App Store payers are on their first read) is a placeholder marked
  // `connecting`. With no key, every card is Not connected.
  const strip = liveKpis(kpis(today), feed, (id) => snapshotFor(id, { today }), timeZone)
  const mrr = liveMetric("mrr", feed, timeZone)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <header className={HOME_HEADER}>
        <div className={HOME_HEADER_TOP}>
          <div className={HOME_TITLE}>
            <h1 className="text-display-sm font-semibold tracking-tight">Home</h1>
            <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
              <span>{pulse}</span>
              {clock ? (
                <span className="tabular-nums" data-testid="home-clock">
                  {" · "}
                  {clock}
                </span>
              ) : null}
            </p>
          </div>
          {/* Option A: top-right of the header. The phone copy lives in the
              top bar (AppHeader), so this one starts at md. */}
          <SubscriberTicker variant="header" className={HOME_TICKER} />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        {/* No source for the #1 yet (My Desk is not wired), so the honest empty state. */}
        <NumberOneStrip item={null} />
        <KpiStrip kpis={strip} title={kpiStripTitle} />
        <div role="group" aria-label="Doors" className={HOME_DOORS}>
          <MetricsDoor
            // MRR always has a value (a sum, never a ratio), so no point is null.
            trend={mrr.kind === "live" ? (mrr.metric.series as number[]) : []}
            today={today}
            // MRR is a Stripe metric, never founder entries; that kind only
            // narrows the type.
            state={
              mrr.kind === "loading" && mrr.connecting
                ? "connecting"
                : mrr.kind === "entries"
                  ? "not_connected"
                  : mrr.kind
            }
            updated={mrr.kind === "live" ? mrr.metric.updated : null}
          />
          {/* The Workplace board and Inbox are design mocks with no live
              source yet, so their doors say Not connected. */}
          <DevBoardDoor preview={null} notConnected />
          <NeedsYouDoor
            className={HOME_INBOX_DOOR}
            needs={{ items: [], waiting: 0, overflow: 0 }}
            now={now}
            notConnected
          />
        </div>
      </div>
    </div>
  )
}
