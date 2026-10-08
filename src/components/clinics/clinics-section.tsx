"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { formatDate, formatRelativeDay, type IsoDay } from "@/lib/clock"
import {
  ATTENDANCES,
  ATTENDANCE_LABEL,
  CLINIC_TYPE_LABEL,
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
import { ResponsiveTable, RowCollapse } from "@/components/responsive-table"
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

export type ClinicColumn = (typeof COLUMNS)[number]

/** Deke 10:1281 Upcoming tablet: Name, Date, Type, Owner, Status. */
export const TABLET_UPCOMING_COLUMNS = ["Name", "Date", "Type", "Owner", "Status"] as const

/** Deke 10:1235 Past tablet: Name, Date, Collected, Status. */
export const TABLET_PAST_COLUMNS = ["Name", "Date", "Collected", "Status"] as const

/**
 * Columns the tablet table hides (768–1279). They stay in the DOM for
 * ≥1280 and fold into Name / Date / Collected sublines below `xl`.
 */
export function isTabletHiddenColumn(past: boolean, column: ClinicColumn) {
  if (column === "City" || column === "Attend") return true
  if (column === "Collected") return !past
  if (column === "Type" || column === "Owner") return past
  return false
}

const TABLET_HIDE = "hidden xl:table-cell"

/**
 * Nova `.cn-table-cell` nowrap beats `CELL`. Below xl the Name column is the
 * one that yields: constrain it and truncate name / host / notes so Status
 * and the ⋯ stay inside the card (820 / 1180).
 */
export const TABLET_NAME_CELL = "max-xl:max-w-0 max-xl:min-w-0 max-xl:whitespace-normal!"

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
            className="text-muted-foreground opacity-60 group-hover/row:opacity-100 hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 md:max-xl:h-11! md:max-xl:w-11! md:max-xl:opacity-100!"
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

function clinicCardMeta(clinic: Clinic, today: IsoDay, past: boolean) {
  const city = clinic.city || "—"
  const type = CLINIC_TYPE_LABEL[clinic.type]
  const when = [formatDate(clinic.date), formatRelativeDay(clinic.date, today), city, type].join(" · ")
  const collected = formatCollected(clinic.collected)
  const host = past ? (collected ?? "Nothing yet") : [clinic.host, clinic.owner].filter(Boolean).join(" · ")
  return [
    { label: "When", value: when },
    { label: past ? "Collected" : "Host", value: host },
  ]
}

function ClinicCards({
  rows,
  today,
  past,
  emptyText,
  actions,
}: {
  rows: Clinic[]
  today: IsoDay
  past: boolean
  emptyText: string
  actions: RowActions
}) {
  if (rows.length === 0) {
    return (
      <div role="listitem">
        <div role="status" className="text-muted-foreground px-4 py-8 text-center text-sm">
          {emptyText}
        </div>
      </div>
    )
  }
  return rows.map((c) => (
    <RowCollapse
      key={c.id}
      title={c.name}
      status={<StatusPill status={statusOf(c, today)} />}
      sample={isSeedClinic(c)}
      meta={clinicCardMeta(c, today, past)}
      onClick={() => actions.onEdit(c, "name")}
    />
  ))
}

/**
 * One block of the page — Upcoming or Past — as the mock lays it out: a
 * title with a count, then a table. `rows` arrive already ordered.
 *
 * Phone (<768): RowCollapse cards (Deke 10:695). Tablet (768–1279): ≤5
 * data columns with extras folded into Name / Date / Collected (10:1281).
 * ≥1280 keeps the locked 8-column table.
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
        <ResponsiveTable
          layout="stack"
          stacked={
            <ClinicCards rows={rows} today={today} past={past} emptyText={emptyText} actions={actions} />
          }
        >
          <Table aria-label={name}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((c) => (
                  <TableHead
                    key={c}
                    className={cn(HEAD, c === "Name" && "w-[26%]", isTabletHiddenColumn(past, c) && TABLET_HIDE)}
                  >
                    {c}
                  </TableHead>
                ))}
                <TableHead className={cn(HEAD, "w-10 max-xl:w-11")}>
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
                  const hostLine = past
                    ? [c.host, CLINIC_TYPE_LABEL[c.type]].filter(Boolean).join(" · ")
                    : c.host
                  return (
                    <TableRow key={c.id} className="group/row hover:bg-transparent" data-clinic={c.id}>
                      <TableCell className={cn(CELL, TABLET_NAME_CELL)}>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5 max-xl:flex-nowrap">
                            <span className="text-label font-semibold tracking-tight max-xl:truncate">
                              {c.name}
                            </span>
                            {isSeedClinic(c) && <SampleDataTag className="max-xl:shrink-0" />}
                          </span>
                          {past ? (
                            <>
                              {hostLine ? (
                                <span className="text-caption text-muted-foreground max-xl:truncate xl:hidden">
                                  {hostLine}
                                </span>
                              ) : null}
                              {c.host ? (
                                <span className="text-caption text-muted-foreground hidden xl:inline">
                                  {c.host}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            c.host && (
                              <span className="text-caption text-muted-foreground max-xl:truncate">
                                {c.host}
                              </span>
                            )
                          )}
                          {c.notes && (
                            <span
                              className="text-caption text-muted-foreground line-clamp-1 max-xl:min-w-0"
                              title={c.notes}
                            >
                              {c.notes}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(CELL, "whitespace-nowrap", past && "text-muted-foreground")}
                      >
                        <div className="flex flex-col gap-0.5 tabular-nums">
                          <span>{formatDate(c.date)}</span>
                          <span className="text-micro text-muted-foreground">
                            {formatRelativeDay(c.date, today)}
                            {c.city ? <span className="xl:hidden">{` · ${c.city}`}</span> : null}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          CELL,
                          c.type === "zoom" && "text-muted-foreground",
                          isTabletHiddenColumn(past, "City") && TABLET_HIDE
                        )}
                      >
                        {c.city || "—"}
                      </TableCell>
                      <TableCell className={cn(CELL, isTabletHiddenColumn(past, "Type") && TABLET_HIDE)}>
                        <TypePill type={c.type} />
                      </TableCell>
                      <TableCell className={cn(CELL, isTabletHiddenColumn(past, "Attend") && TABLET_HIDE)}>
                        <AttendanceText attendance={c.attendance} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          CELL,
                          "whitespace-nowrap tabular-nums",
                          !collected && "text-muted-foreground",
                          isTabletHiddenColumn(past, "Collected") && TABLET_HIDE
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{collected ?? (past ? "Nothing yet" : "—")}</span>
                          <span className="text-micro text-muted-foreground xl:hidden">
                            {ATTENDANCE_LABEL[c.attendance]}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={cn(CELL, isTabletHiddenColumn(past, "Owner") && TABLET_HIDE)}>
                        {c.owner}
                      </TableCell>
                      <TableCell className={cn(CELL, "max-xl:w-px")}>
                        <StatusPill status={status} />
                      </TableCell>
                      <TableCell className={cn(CELL, "py-2 pr-3 pl-0 text-right max-xl:w-px")}>
                        <RowMenu clinic={c} actions={actions} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </ResponsiveTable>
      </TableCard>
    </section>
  )
}
