"use client"

import { boardPreview, needsYou } from "@/lib/home"
import { kpis, mrrTrend, numberOne } from "@/lib/home-fixture"
import { inbox } from "@/lib/workplace-fixture"
import { useIssues } from "@/components/agent-workplace/issues-store"
import { DevBoardDoor } from "@/components/home/dev-board-door"
import { KpiStrip } from "@/components/home/kpi-strip"
import { MetricsDoor } from "@/components/home/metrics-door"
import { NeedsYouDoor } from "@/components/home/needs-you-door"
import { NumberOneStrip } from "@/components/home/number-one-strip"

/**
 * The founder's pulse for the day: one thing, four numbers, three doors.
 * Must sit inside an IssuesProvider — the Dev board and Needs-you doors read
 * the Workplace store so Home always matches the board.
 */
export function HomeScreen({ pulse }: { pulse: string }) {
  const { issues, sprints, actors, now } = useIssues()
  const needs = needsYou(inbox, issues)
  const board = boardPreview(issues, sprints, actors, now)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">Home</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            {pulse}
          </p>
        </div>
        <span className="text-muted-foreground border-surface-border bg-surface mt-1 shrink-0 rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase">
          Dummy / design mock
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <NumberOneStrip item={numberOne} />
        <KpiStrip kpis={kpis} />
        <div
          role="group"
          aria-label="Doors"
          className="grid min-h-[200px] flex-1 grid-cols-1 gap-4 lg:grid-cols-3"
        >
          <MetricsDoor trend={mrrTrend} />
          <DevBoardDoor preview={board} />
          <NeedsYouDoor needs={needs} />
        </div>
      </div>
    </div>
  )
}
