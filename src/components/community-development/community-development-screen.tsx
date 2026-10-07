"use client"

import * as React from "react"
import { EllipsisIcon, HeartHandshakeIcon, PlusIcon } from "lucide-react"

import { formatRelativeDay } from "@/lib/clock"
import {
  describeInitiative,
  filterInitiatives,
  formatWhen,
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_LABEL,
  isSeedInitiative,
  isStatusFilter,
  isTypeFilter,
  STATUS_FILTER_LABEL,
  STATUS_FILTERS,
  summarize,
  TYPE_FILTER_LABEL,
  TYPE_FILTERS,
  type Initiative,
  type InitiativeStatus,
  type StatusFilter,
  type TypeFilter,
} from "@/lib/community-development"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CELL, HEAD, TableCard } from "@/components/table-bits"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { useCommunityDevelopment } from "@/components/community-development/community-development-store"
import { InitiativeDetail } from "@/components/community-development/initiative-detail"
import {
  InitiativeDialog,
  SPAWN_LABEL,
  SPAWN_SOON,
} from "@/components/community-development/initiative-dialog"
import { StatusPill, TypePill } from "@/components/community-development/initiative-pills"

export const LEDE = "Giving and foundation work — not coach communities or content"

/** The locked column set, in order. Exported so tests assert the same list. */
export const COLUMNS = ["Name", "Type", "Partner", "When", "Status", "Owner", "Impact"] as const

/**
 * Stands in for the table until localStorage has been read. Showing the
 * seed here would flash rows the founder may have deleted.
 */
function ScreenSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading saved initiatives"
      className="flex flex-col gap-[22px]"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <Skeleton className="h-[360px] w-full rounded-xl" />
    </div>
  )
}

/**
 * A dialog target that outlives its own close: `open` flips off while the
 * row stays, so the copy does not blank out mid-fade and the edit dialog
 * never flips to "Add" on the way out.
 */
type Target = { initiative: Initiative; open: boolean }

function DeleteDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: Target | null
  onOpenChange: (open: boolean) => void
  onConfirm: (initiative: Initiative) => void
}) {
  const row = target?.initiative ?? null
  return (
    <Dialog open={target?.open ?? false} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm!">
        <DialogHeader>
          <DialogTitle>Delete this initiative?</DialogTitle>
          <DialogDescription>
            {row ? describeInitiative(row) : ""} comes off the list. There is no server copy to
            recover it from.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (row) onConfirm(row)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryStrip({
  active,
  upcoming,
  doneThisYear,
}: {
  active: number
  upcoming: number
  doneThisYear: number
}) {
  const cards = [
    { label: "Active", value: active, hint: "Initiatives underway" },
    { label: "Upcoming (30 days)", value: upcoming, hint: "Dated in the next 30 days" },
    { label: "Done this year", value: doneThisYear, hint: "Finished on a day this year" },
  ] as const
  return (
    <div
      role="group"
      aria-label="Giving summary"
      className="grid gap-3 sm:grid-cols-3"
      data-testid="giving-summary"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-surface border-surface-border flex flex-col gap-1 rounded-xl border px-4 py-3"
        >
          <p className="text-display-sm font-semibold tracking-tight tabular-nums">{card.value}</p>
          <p className="text-label text-foreground font-medium">{card.label}</p>
          <p className="text-caption text-muted-foreground">{card.hint}</p>
        </div>
      ))}
    </div>
  )
}

function FilterBar({
  type,
  status,
  onType,
  onStatus,
}: {
  type: TypeFilter
  status: StatusFilter
  onType: (next: TypeFilter) => void
  onStatus: (next: StatusFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        aria-label="Filter by type"
        value={[type]}
        onValueChange={(next) => {
          const picked = next.find(isTypeFilter)
          if (picked && picked !== type) onType(picked)
        }}
        variant="outline"
        spacing={0}
        className="bg-surface rounded-lg"
      >
        {TYPE_FILTERS.map((f) => (
          <ToggleGroupItem
            key={f}
            value={f}
            size="sm"
            className="text-label px-3 first:rounded-l-lg last:rounded-r-lg aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
          >
            {TYPE_FILTER_LABEL[f]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        aria-label="Filter by status"
        value={[status]}
        onValueChange={(next) => {
          const picked = next.find(isStatusFilter)
          if (picked && picked !== status) onStatus(picked)
        }}
        variant="outline"
        spacing={0}
        className="bg-surface rounded-lg"
      >
        {STATUS_FILTERS.map((f) => (
          <ToggleGroupItem
            key={f}
            value={f}
            size="sm"
            className="text-label px-3 first:rounded-l-lg last:rounded-r-lg aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
          >
            {STATUS_FILTER_LABEL[f]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function RowMenu({
  initiative,
  onView,
  onEdit,
  onDelete,
  onStatus,
}: {
  initiative: Initiative
  onView: (row: Initiative) => void
  onEdit: (row: Initiative) => void
  onDelete: (row: Initiative) => void
  onStatus: (row: Initiative, status: InitiativeStatus) => void
}) {
  const others = INITIATIVE_STATUSES.filter((s) => s !== initiative.status)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${initiative.name}`}
            title="View, edit, mark or delete"
            className="text-muted-foreground"
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56! min-w-56!">
        <DropdownMenuItem onClick={() => onView(initiative)}>View</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(initiative)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        {others.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onStatus(initiative, s)}>
            Mark {INITIATIVE_STATUS_LABEL[s].toLowerCase()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title={SPAWN_SOON} aria-description={SPAWN_SOON}>
          {SPAWN_LABEL}
          <DropdownMenuShortcut>Soon</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(initiative)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The page: header, summary strip, filters, then the table. Must sit
 * inside a CommunityDevelopmentProvider.
 */
export function CommunityDevelopmentScreen() {
  const store = useCommunityDevelopment()
  const { today, initiatives, persisted, setStatus, removeInitiative } = store
  const [type, setType] = React.useState<TypeFilter>("all")
  const [status, setStatusFilter] = React.useState<StatusFilter>("all")

  const visible = React.useMemo(
    () => filterInitiatives(initiatives, type, status),
    [initiatives, type, status]
  )
  const summary = React.useMemo(() => summarize(initiatives, today), [initiatives, today])

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<Target | null>(null)
  const [viewing, setViewing] = React.useState<Target | null>(null)
  const [deleting, setDeleting] = React.useState<Target | null>(null)

  const emptyFilter = persisted && initiatives.length > 0 && visible.length === 0
  const emptyAll = persisted && initiatives.length === 0

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">Community Development</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5">
          <PersistenceNote store={store} />
          <SampleDataTag className="h-6 px-2" />
          <Button size="sm" className="h-9 px-3.5" onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add initiative
          </Button>
        </div>
      </header>

      {!persisted ? (
        <ScreenSkeleton />
      ) : emptyAll ? (
        <div
          role="status"
          aria-label="No initiatives"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <HeartHandshakeIcon className="text-muted-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No giving initiatives yet</p>
          <p className="text-caption">
            Add the first one — a volunteer day, a donation, a foundation program, or an
            outreach event. Or Reset to bring the sample rows back.
          </p>
          <Button size="sm" variant="outline" className="mt-1" onClick={() => setAdding(true)}>
            <PlusIcon aria-hidden />
            Add initiative
          </Button>
        </div>
      ) : (
        <>
          <SummaryStrip
            active={summary.active}
            upcoming={summary.upcoming}
            doneThisYear={summary.doneThisYear}
          />
          <FilterBar type={type} status={status} onType={setType} onStatus={setStatusFilter} />
          {emptyFilter ? (
            <div
              role="status"
              aria-label="No matching initiatives"
              className="border-surface-border flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
            >
              <p className="text-body text-foreground font-medium">Nothing in this view</p>
              <p className="text-caption text-muted-foreground">
                Switch the type or status filter above to see the rest.
              </p>
            </div>
          ) : (
            <section aria-label="Giving initiatives" className="flex flex-col gap-2.5">
              <div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
                <h2 className="text-label font-semibold tracking-tight">Initiatives</h2>
                <span
                  data-testid="section-count"
                  className="text-micro text-muted-foreground bg-muted inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
                  aria-label={`${visible.length} initiatives`}
                >
                  {visible.length}
                </span>
              </div>
              <TableCard note="Seed rows are invented giving work; initiatives you add or change are saved in this browser. No dollar totals.">
                <Table aria-label="Giving initiatives">
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
                    {visible.map((row) => {
                      const when = formatWhen(row, today)
                      return (
                        <TableRow
                          key={row.id}
                          className="group/row hover:bg-transparent"
                          data-initiative={row.id}
                        >
                          <TableCell className={cn(CELL, "min-w-0 whitespace-normal!")}>
                            <div className="flex flex-col gap-0.5">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  variant="link"
                                  className="text-label text-foreground h-auto whitespace-normal p-0 text-left font-semibold tracking-tight"
                                  onClick={() => setViewing({ initiative: row, open: true })}
                                >
                                  {row.name}
                                </Button>
                                {isSeedInitiative(row) && <SampleDataTag />}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className={CELL}>
                            <TypePill type={row.type} />
                          </TableCell>
                          <TableCell className={cn(CELL, "min-w-0 whitespace-normal!")}>
                            {row.partner || "—"}
                          </TableCell>
                          <TableCell className={cn(CELL, "whitespace-nowrap")}>
                            <div className="flex flex-col gap-0.5">
                              <span>{when.primary}</span>
                              {row.date && (
                                <span className="text-micro text-muted-foreground tabular-nums">
                                  {formatRelativeDay(row.date, today)}
                                </span>
                              )}
                              {when.secondary && (
                                <span className="text-micro text-muted-foreground">
                                  {when.secondary}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={CELL}>
                            <StatusPill status={row.status} />
                          </TableCell>
                          <TableCell className={CELL}>{row.owner}</TableCell>
                          <TableCell
                            className={cn(
                              CELL,
                              "max-w-[11rem] min-w-0 whitespace-normal!",
                              !row.impact && "text-muted-foreground"
                            )}
                          >
                            <span className="line-clamp-2" title={row.impact || undefined}>
                              {row.impact || "—"}
                            </span>
                          </TableCell>
                          <TableCell className={cn(CELL, "py-2 pr-3 pl-0 text-right")}>
                            <RowMenu
                              initiative={row}
                              onView={(r) => setViewing({ initiative: r, open: true })}
                              onEdit={(r) => setEditing({ initiative: r, open: true })}
                              onDelete={(r) => setDeleting({ initiative: r, open: true })}
                              onStatus={(r, next) => setStatus(r.id, next)}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableCard>
            </section>
          )}
        </>
      )}

      <InitiativeDialog open={adding} onOpenChange={setAdding} initiative={null} />
      <InitiativeDialog
        open={editing?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setEditing((t) => (t ? { ...t, open: false } : t))
        }}
        initiative={editing?.initiative ?? null}
      />
      <InitiativeDetail
        target={viewing}
        today={today}
        onOpenChange={(open) => {
          if (!open) setViewing((t) => (t ? { ...t, open: false } : t))
        }}
        onEdit={(row) => {
          setViewing((t) => (t ? { ...t, open: false } : t))
          setEditing({ initiative: row, open: true })
        }}
        onDelete={(row) => {
          setViewing((t) => (t ? { ...t, open: false } : t))
          setDeleting({ initiative: row, open: true })
        }}
      />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
        onConfirm={(row) => {
          removeInitiative(row.id)
          setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
      />
    </div>
  )
}
