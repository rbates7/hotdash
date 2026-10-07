"use client"

import { nextRunLabel } from "@/lib/autopilots"
import { autopilots, type Autopilot } from "@/lib/workplace-fixture"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  WORKPLACE_AUTOPILOT_BODY,
  WORKPLACE_AUTOPILOT_CELL,
  WORKPLACE_AUTOPILOT_HEAD,
  WORKPLACE_AUTOPILOT_ROW,
  WORKPLACE_AUTOPILOT_TABLE,
} from "@/components/agent-workplace/responsive"
import { useIssues } from "@/components/agent-workplace/issues-store"

function RunPill({ state }: { state: Autopilot["lastRun"] }) {
  return (
    <span
      className={cn(
        "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight",
        state === "ok"
          ? "bg-success/10 text-success-text"
          : "bg-muted text-muted-foreground"
      )}
    >
      {state}
    </span>
  )
}

const HEAD = "text-micro text-muted-foreground h-auto px-[18px] py-3 font-medium tracking-[0.05em] uppercase"
const CELL = "text-label px-[18px] py-4 whitespace-normal"

export function AutopilotsPanel() {
  const { now } = useIssues()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground -mt-1 tracking-tight">
        Schedules assumed for this mock.
      </p>
      <div className="bg-surface border-surface-border max-w-[1100px] overflow-hidden rounded-xl border">
        <Table className={WORKPLACE_AUTOPILOT_TABLE}>
          <TableHeader className={WORKPLACE_AUTOPILOT_HEAD}>
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD}>Autopilot</TableHead>
              <TableHead className={cn(HEAD, "max-lg:hidden")}>Schedule</TableHead>
              <TableHead className={cn(HEAD, "max-lg:hidden")}>Next run</TableHead>
              <TableHead className={HEAD}>Last run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={WORKPLACE_AUTOPILOT_BODY}>
            {autopilots.map((ap) => {
              const next = nextRunLabel(ap.schedule, now)
              return (
                <TableRow key={ap.id} className={WORKPLACE_AUTOPILOT_ROW}>
                  <TableCell className={cn(CELL, WORKPLACE_AUTOPILOT_CELL)}>
                    <p className="font-semibold tracking-tight">{ap.name}</p>
                    <p className="text-caption text-muted-foreground mt-[3px] max-lg:hidden">
                      {ap.note}
                    </p>
                    <p className="text-caption text-muted-foreground mt-[3px] lg:hidden">
                      {ap.scheduleLabel} · {ap.note}
                    </p>
                    <p className="text-caption text-muted-foreground mt-[3px] lg:hidden">
                      Next run {next} · Last run {ap.lastRun}
                    </p>
                  </TableCell>
                  <TableCell className={cn(CELL, WORKPLACE_AUTOPILOT_CELL, "max-lg:hidden")}>
                    {ap.scheduleLabel}
                  </TableCell>
                  <TableCell className={cn(CELL, WORKPLACE_AUTOPILOT_CELL, "max-lg:hidden")}>
                    {next}
                  </TableCell>
                  <TableCell className={cn(CELL, WORKPLACE_AUTOPILOT_CELL, "max-md:pt-0.5!")}>
                    <RunPill state={ap.lastRun} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
