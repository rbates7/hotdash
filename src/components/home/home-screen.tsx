"use client"

import { todayIn } from "@/lib/clock"
import { boardPreview, needsYou, pulseLabel } from "@/lib/home"
import { kpiStripTitle, kpis, numberOne } from "@/lib/home-fixture"
import { mrrTrend } from "@/lib/kpis"
import { buildInbox } from "@/lib/workplace-fixture"
import { useSettings } from "@/hooks/use-settings"
import { useWallClock } from "@/hooks/use-wall-clock"
import { useIssues } from "@/components/agent-workplace/issues-store"
import { PersistenceNote } from "@/components/persistence-note"
import { DevBoardDoor } from "@/components/home/dev-board-door"
import { KpiStrip } from "@/components/home/kpi-strip"
import { MetricsDoor } from "@/components/home/metrics-door"
import { NeedsYouDoor } from "@/components/home/needs-you-door"
import { NumberOneStrip } from "@/components/home/number-one-strip"
import {
  HOME_DOORS,
  HOME_DUMMY,
  HOME_HEADER,
  HOME_HEADER_META,
  HOME_INBOX_DOOR,
  HOME_NOTE,
  HOME_RESET,
} from "@/components/home/responsive"

/**
 * The founder's pulse for the day: one thing, four numbers, three doors.
 * Must sit inside an IssuesProvider — the Dev board and Needs-you doors read
 * the Workplace store so Home always matches the board.
 */
export function HomeScreen() {
  const store = useIssues()
  const { issues, sprints, actors, now, persisted } = store
  // The weekday and the clock read in the founder's Settings zone (Central
  // until the browser's copy is read, so the server HTML hydrates cleanly).
  const { timeZone } = useSettings()
  const pulse = pulseLabel(now, timeZone)
  const clock = useWallClock(timeZone)
  // The page's instant, as the founder's calendar day: the same `today` the
  // Metrics page would compute, so the strip and door match it.
  const today = todayIn(now)
  const needs = needsYou(buildInbox(now), issues)
  const board = boardPreview(issues, sprints, actors, now)
  // Until the browser's saved board is read, the two store-backed doors show
  // placeholders rather than flashing the seed and then swapping.
  const loading = !persisted

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <header className={HOME_HEADER}>
        <div className="min-w-0 max-md:w-full">
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
        <div className={HOME_HEADER_META}>
          {/* Home reads the Workplace's browser-saved board, so it says so
              the same way the Workplace does. */}
          <PersistenceNote
            store={store}
            className={HOME_NOTE}
            resetClassName={HOME_RESET}
          />
          <span className={HOME_DUMMY}>Dummy / design mock</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <NumberOneStrip item={numberOne} />
        <KpiStrip kpis={kpis(today)} title={kpiStripTitle} />
        <div role="group" aria-label="Doors" className={HOME_DOORS}>
          <MetricsDoor trend={mrrTrend({ today })} today={today} />
          <DevBoardDoor preview={board} loading={loading} />
          <NeedsYouDoor
            className={HOME_INBOX_DOOR}
            needs={needs}
            now={now}
            loading={loading}
          />
        </div>
      </div>
    </div>
  )
}
