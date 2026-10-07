"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { formatDate, formatRelativeDay, type IsoDay } from "@/lib/clock"
import {
  ATTENDANCES,
  ATTENDANCE_LABEL,
  formatCollected,
  isSeedClinic,
  statusOf,
  type Attendance,
  type Clinic,
} from "@/lib/clinics"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard } from "@/components/table-bits"
import { SampleDataTag } from "@/components/sample-data"
import { AttendanceText, StatusPill, TypePill } from "@/components/clinics/clinic-pills"
import { SPAWN_LABEL, SPAWN_SOON, type DialogFocus } from "@/components/clinics/clinic-dialog"

export type RowActions = {
  onEdit: (clinic: Clinic, focus: DialogFocus) => void
  onDelete: (clinic: Clinic) => void
  onAttendance: (clinic: Clinic, attendance: Attendance) => void
}

/** The locked column set, in order. Exported so tests assert the same list. */
export const COLUMNS = [
  "Name",
  "Date",
  "City",
  "Type",
  "Attend",
  "Collected",
  "Owner",
  "Status",
] as const

function RowMenu({ clinic, actions }: { clinic: Clinic; actions: RowActions }) {
  const others = ATTENDANCES.filter((a) => a !== clinic.attendance)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${clinic.name}`}
            title="Edit, record, mark or delete"
            className="text-muted-foreground opacity-60 group-hover/row:opacity-100 hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      {/* Nova pins min-w-32 and the width to the (icon-sized) anchor; a
          menu this wordy needs its own width. */}
      <DropdownMenuContent align="end" className="w-56! min-w-56!">
        <DropdownMenuItem onClick={() => actions.onEdit(clinic, "name")}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onEdit(clinic, "collected")}>
          Record collected
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {others.map((a) => (
          <DropdownMenuItem key={a} onClick={() => actions.onAttendance(clinic, a)}>
            Mark {ATTENDANCE_LABEL[a].toLowerCase()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title={SPAWN_SOON} aria-description={SPAWN_SOON}>
          {SPAWN_LABEL}
          <DropdownMenuShortcut>Soon</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(clinic)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One block of the page — Upcoming or Past — as the mock lays it out: a
 * title with a count, then a table. `rows` arrive already ordered.
 */
export function ClinicsSection({
  title,
  rows,
  today,
  emptyText,
  actions,
}: {
  title: "Upcoming" | "Past"
  rows: Clinic[]
  today: IsoDay
  emptyText: string
  actions: RowActions
}) {
  const name = `${title} clinics`
  const past = title === "Past"
  return (
    <section aria-label={name} className="flex flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
        <h2 className="text-label font-semibold tracking-tight">{title}</h2>
        <span
          data-testid="section-count"
          className="text-micro text-muted-foreground bg-muted inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
          aria-label={`${rows.length} ${past ? "past" : "upcoming"}`}
        >
          {rows.length}
        </span>
      </div>
      <TableCard>
        <Table aria-label={name}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((c) => (
                <TableHead key={c} className={cn(HEAD, c === "Name" && "w-[26%]")}>
                  {c}
                </TableHead>
              ))}
              <TableHead className={cn(HEAD, "w-10")}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={COLUMNS.length + 1}
                  role="status"
                  className={cn(CELL, "text-muted-foreground py-8 text-center")}
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => {
                const status = statusOf(c, today)
                const collected = formatCollected(c.collected)
                return (
                  <TableRow key={c.id} className="group/row hover:bg-transparent" data-clinic={c.id}>
                    <TableCell className={CELL}>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-label font-semibold tracking-tight">{c.name}</span>
                          {isSeedClinic(c) && <SampleDataTag />}
                        </span>
                        {c.host && (
                          <span className="text-caption text-muted-foreground">{c.host}</span>
                        )}
                        {c.notes && (
                          <span
                            className="text-caption text-muted-foreground line-clamp-1"
                            title={c.notes}
                          >
                            {c.notes}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={cn(CELL, "whitespace-nowrap", past && "text-muted-foreground")}>
                      <div className="flex flex-col gap-0.5 tabular-nums">
                        <span>{formatDate(c.date)}</span>
                        <span className="text-micro text-muted-foreground">{formatRelativeDay(c.date, today)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn(CELL, c.type === "zoom" && "text-muted-foreground")}>
                      {c.city || "—"}
                    </TableCell>
                    <TableCell className={CELL}>
                      <TypePill type={c.type} />
                    </TableCell>
                    <TableCell className={CELL}>
                      <AttendanceText attendance={c.attendance} />
                    </TableCell>
                    <TableCell className={cn(CELL, "whitespace-nowrap tabular-nums", !collected && "text-muted-foreground")}>
                      {collected ?? (past ? "Nothing yet" : "—")}
                    </TableCell>
                    <TableCell className={CELL}>{c.owner}</TableCell>
                    <TableCell className={CELL}>
                      <StatusPill status={status} />
                    </TableCell>
                    <TableCell className={cn(CELL, "py-2 pr-3 pl-0 text-right")}>
                      <RowMenu clinic={c} actions={actions} />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableCard>
    </section>
  )
}
