"use client"

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

function RunPill({ state }: { state: Autopilot["lastRun"] }) {
  return (
    <span
      className={cn(
        "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight",
        state === "ok"
          ? "bg-success/10 text-success"
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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground -mt-1 tracking-tight">
        Schedules assumed for this mock.
      </p>
      <div className="bg-surface border-surface-border max-w-[1100px] overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD}>Autopilot</TableHead>
              <TableHead className={HEAD}>Schedule</TableHead>
              <TableHead className={HEAD}>Next run</TableHead>
              <TableHead className={HEAD}>Last run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {autopilots.map((ap) => (
              <TableRow key={ap.id} className="hover:bg-transparent">
                <TableCell className={CELL}>
                  <p className="font-semibold tracking-tight">{ap.name}</p>
                  <p className="text-caption text-muted-foreground mt-[3px]">
                    {ap.note}
                  </p>
                </TableCell>
                <TableCell className={CELL}>{ap.schedule}</TableCell>
                <TableCell className={CELL}>{ap.nextRun}</TableCell>
                <TableCell className={CELL}>
                  <RunPill state={ap.lastRun} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
