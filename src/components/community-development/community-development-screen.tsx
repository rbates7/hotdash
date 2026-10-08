"use client"

import * as React from "react"
import { EllipsisIcon, HeartHandshakeIcon, PlusIcon } from "lucide-react"

import { formatRelativeDay, type IsoDay } from "@/lib/clock"
import {
  describeInitiative,
  filterInitiatives,
  formatWhen,
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_LABEL,
  INITIATIVE_TYPE_LABEL,
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
import { ResponsiveTable, RowCollapse } from "@/components/responsive-table"
import { SampleDataTag } from "@/components/sample-data"
import { useCommunityDevelopment } from "@/components/community-development/community-development-store"
import { InitiativeDetail } from "@/components/community-development/initiative-detail"
import {
  InitiativeDialog,
  InitiativeOverlay,
  SPAWN_LABEL,
  SPAWN_SOON,
  type OverlayFocus,
} from "@/components/community-development/initiative-dialog"
import { StatusPill, TypePill } from "@/components/community-development/initiative-pills"
import {
  CD_ADD,
  CD_DESTRUCTIVE,
  CD_FILTER_GROUP,
  CD_FILTER_ITEM,
  CD_FILTERS,
  CD_FILTERS_FADE,
  CD_FILTERS_WRAP,
  CD_HEADER,
  CD_MENU_ITEM,
  CD_PRESSED,
  CD_RESET,
  CD_TOUCH,
  TABLET_HIDE,
  TABLET_NAME_CELL,
} from "@/components/community-development/responsive"

export const LEDE = "Giving and foundation work — not coach communities or content"

/** The locked column set, in order. Exported so tests assert the same list. */
export const COLUMNS = ["Name", "Type", "Partner", "When", "Status", "Owner", "Impact"] as const

export type InitiativeColumn = (typeof COLUMNS)[number]

/** Deke 7:47 / Clinics 10:1281: five data columns. Partner and Impact fold under Name. */
export const TABLET_COLUMNS = ["Name", "Type", "When", "Status", "Owner"] as const

export function isTabletHiddenColumn(column: InitiativeColumn) {
  return column === "Partner" || column === "Impact"
}

/** Phone card meta (Deke 7:47): Type · Partner / When · Owner. */
export function initiativeCardMeta(row: Initiative, today: IsoDay) {
  const when = formatWhen(row, today)
  const whenBits = [when.primary]
  if (row.date) whenBits.push(formatRelativeDay(row.date, today))
  return [
    { label: "Type", value: [INITIATIVE_TYPE_LABEL[row.type], row.partner || "—"].join(" · ") },
    { label: "When", value: [...whenBits, row.owner].join(" · ") },
  ]
}

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
  finalFocus,
}: {
  target: Target | null
  onOpenChange: (open: boolean) => void
  onConfirm: (initiative: Initiative) => void
  finalFocus?: OverlayFocus
}) {
  const row = target?.initiative ?? null
  return (
    <InitiativeOverlay
      open={target?.open ?? false}
      onOpenChange={onOpenChange}
      dialogClassName="sm:max-w-sm!"
      finalFocus={finalFocus}
    >
      <DialogHeader className={CD_HEADER}>
        <DialogTitle>Delete this initiative?</DialogTitle>
        <DialogDescription>
          {row ? describeInitiative(row) : ""} comes off the list. There is no server copy to
          recover it from.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" className={CD_TOUCH} onClick={() => onOpenChange(false)}>
          Keep it
        </Button>
        <Button
          variant="destructive"
          className={cn(CD_TOUCH, CD_DESTRUCTIVE)}
          onClick={() => {
            if (row) onConfirm(row)
          }}
        >
          Delete
        </Button>
      </DialogFooter>
    </InitiativeOverlay>
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
    <div className={CD_FILTERS_WRAP} data-testid="cd-filters-wrap">
      <div className={CD_FILTERS} data-testid="cd-filters">
        <ToggleGroup
          aria-label="Filter by type"
          value={[type]}
          onValueChange={(next) => {
            const picked = next.find(isTypeFilter)
            if (picked && picked !== type) onType(picked)
          }}
          variant="outline"
          spacing={0}
          className={CD_FILTER_GROUP}
        >
          {TYPE_FILTERS.map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              size="sm"
              className={cn(CD_FILTER_ITEM, CD_PRESSED)}
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
          className={CD_FILTER_GROUP}
        >
          {STATUS_FILTERS.map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              size="sm"
              className={cn(CD_FILTER_ITEM, CD_PRESSED)}
            >
              {STATUS_FILTER_LABEL[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div aria-hidden data-testid="cd-filters-fade" className={CD_FILTERS_FADE} />
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
            className="text-muted-foreground md:max-xl:h-11! md:max-xl:w-11! md:max-xl:opacity-100!"
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56! min-w-56!">
        <DropdownMenuItem className={CD_MENU_ITEM} onClick={() => onView(initiative)}>
          View
        </DropdownMenuItem>
        <DropdownMenuItem className={CD_MENU_ITEM} onClick={() => onEdit(initiative)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {others.map((s) => (
          <DropdownMenuItem
            key={s}
            className={CD_MENU_ITEM}
            onClick={() => onStatus(initiative, s)}
          >
            Mark {INITIATIVE_STATUS_LABEL[s].toLowerCase()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={CD_MENU_ITEM}
          disabled
          title={SPAWN_SOON}
          aria-description={SPAWN_SOON}
        >
          {SPAWN_LABEL}
          <DropdownMenuShortcut>Soon</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={CD_MENU_ITEM}
          variant="destructive"
          onClick={() => onDelete(initiative)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InitiativeCards({
  rows,
  today,
  onOpen,
}: {
  rows: Initiative[]
  today: IsoDay
  onOpen: (row: Initiative) => void
}) {
  return rows.map((row) => (
    <RowCollapse
      key={row.id}
      title={row.name}
      status={<StatusPill status={row.status} />}
      sample={isSeedInitiative(row)}
      meta={initiativeCardMeta(row, today)}
      onClick={() => onOpen(row)}
    />
  ))
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

  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const sectionRef = React.useRef<HTMLElement | null>(null)
  const lastCard = React.useRef<HTMLElement | null>(null)
  const lastCardIndex = React.useRef(0)
  const [editingFromCard, setEditingFromCard] = React.useState(false)
  const [deleteFromSheet, setDeleteFromSheet] = React.useState(false)

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<Target | null>(null)
  const [viewing, setViewing] = React.useState<Target | null>(null)
  const [deleting, setDeleting] = React.useState<Target | null>(null)

  const emptyFilter = persisted && initiatives.length > 0 && visible.length === 0
  const emptyAll = persisted && initiatives.length === 0

  const afterDelete = () => {
    const section = sectionRef.current
    if (!section) return titleRef.current
    const remaining = Array.from(section.querySelectorAll<HTMLElement>("[data-slot='row-collapse']"))
    return remaining[Math.min(lastCardIndex.current, remaining.length - 1)] ?? titleRef.current
  }

  const backToCard: OverlayFocus = () => {
    const card = lastCard.current
    if (card?.isConnected) return card
    return afterDelete() ?? true
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      <header className="relative flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 max-md:pr-[168px]">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-display-sm font-semibold tracking-tight outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            Community Development
          </h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 md:mt-1">
          <PersistenceNote store={store} resetClassName={CD_RESET} />
          <SampleDataTag className="h-6 px-2" />
          <Button
            size="sm"
            className={cn(CD_ADD, "max-md:absolute max-md:top-0 max-md:right-0")}
            onClick={() => setAdding(true)}
          >
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
          <Button
            size="sm"
            variant="outline"
            className={cn("mt-1", CD_ADD)}
            onClick={() => setAdding(true)}
          >
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
            <section
              ref={sectionRef}
              aria-label="Giving initiatives"
              className="flex flex-col gap-2.5"
            >
              <div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
                <h2
                  data-initiatives-heading
                  tabIndex={-1}
                  className="text-label font-semibold tracking-tight outline-none"
                >
                  Initiatives
                </h2>
                <span
                  data-testid="section-count"
                  className="text-micro text-muted-foreground bg-muted inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
                  aria-label={`${visible.length} initiatives`}
                >
                  {visible.length}
                </span>
              </div>
              <TableCard note="Seed rows are invented giving work; initiatives you add or change are saved in this browser. No dollar totals.">
                <ResponsiveTable
                  layout="stack"
                  onClickCapture={(event) => {
                    const card = (event.target as Element).closest<HTMLElement>(
                      "[data-slot='row-collapse']"
                    )
                    if (!card) return
                    lastCard.current = card
                    const all = Array.from(
                      event.currentTarget.querySelectorAll("[data-slot='row-collapse']")
                    )
                    lastCardIndex.current = Math.max(0, all.indexOf(card))
                  }}
                  stacked={
                    <InitiativeCards
                      rows={visible}
                      today={today}
                      onOpen={(row) => {
                        setEditingFromCard(true)
                        setEditing({ initiative: row, open: true })
                      }}
                    />
                  }
                >
                  <Table aria-label="Giving initiatives">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {COLUMNS.map((c) => (
                          <TableHead
                            key={c}
                            className={cn(
                              HEAD,
                              c === "Name" && "min-w-[16rem] w-[26%]",
                              isTabletHiddenColumn(c) && TABLET_HIDE
                            )}
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
                      {visible.map((row) => {
                        const when = formatWhen(row, today)
                        return (
                          <TableRow
                            key={row.id}
                            className="group/row hover:bg-transparent"
                            data-initiative={row.id}
                          >
                            <TableCell className={cn(CELL, "min-w-[16rem] whitespace-normal!", TABLET_NAME_CELL)}>
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5 max-xl:flex-nowrap">
                                  <Button
                                    variant="link"
                                    className="text-label text-foreground h-auto min-w-0 shrink whitespace-normal! p-0 text-left font-semibold tracking-tight [overflow-wrap:anywhere] max-xl:truncate"
                                    onClick={() => setViewing({ initiative: row, open: true })}
                                  >
                                    {row.name}
                                  </Button>
                                  {isSeedInitiative(row) && (
                                    <SampleDataTag className="max-xl:shrink-0" />
                                  )}
                                </span>
                                <span className="text-caption text-muted-foreground max-xl:truncate xl:hidden">
                                  {row.partner || "—"}
                                </span>
                                {row.impact ? (
                                  <span
                                    className="text-caption text-muted-foreground line-clamp-1 max-xl:min-w-0 xl:hidden"
                                    title={row.impact}
                                  >
                                    {row.impact}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className={CELL}>
                              <TypePill type={row.type} />
                            </TableCell>
                            <TableCell
                              className={cn(
                                CELL,
                                "min-w-0 whitespace-normal!",
                                isTabletHiddenColumn("Partner") && TABLET_HIDE
                              )}
                            >
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
                            <TableCell className={cn(CELL, "max-xl:w-px")}>
                              <StatusPill status={row.status} />
                            </TableCell>
                            <TableCell className={CELL}>{row.owner}</TableCell>
                            <TableCell
                              className={cn(
                                CELL,
                                "max-w-[11rem] min-w-0 whitespace-normal!",
                                !row.impact && "text-muted-foreground",
                                isTabletHiddenColumn("Impact") && TABLET_HIDE
                              )}
                            >
                              <span className="line-clamp-2" title={row.impact || undefined}>
                                {row.impact || "—"}
                              </span>
                            </TableCell>
                            <TableCell className={cn(CELL, "py-2 pr-3 pl-0 text-right max-xl:w-px")}>
                              <RowMenu
                                initiative={row}
                                onView={(r) => setViewing({ initiative: r, open: true })}
                                onEdit={(r) => {
                                  setEditingFromCard(false)
                                  setEditing({ initiative: r, open: true })
                                }}
                                onDelete={(r) => {
                                  setDeleteFromSheet(false)
                                  setDeleting({ initiative: r, open: true })
                                }}
                                onStatus={(r, next) => setStatus(r.id, next)}
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ResponsiveTable>
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
        finalFocus={editingFromCard ? backToCard : undefined}
        onDelete={(row) => {
          setEditingFromCard(false)
          setDeleteFromSheet(true)
          setEditing((t) => (t ? { ...t, open: false } : t))
          setDeleting({ initiative: row, open: true })
        }}
      />
      <InitiativeDetail
        target={viewing}
        today={today}
        onOpenChange={(open) => {
          if (!open) setViewing((t) => (t ? { ...t, open: false } : t))
        }}
        onEdit={(row) => {
          setEditingFromCard(false)
          setViewing((t) => (t ? { ...t, open: false } : t))
          setEditing({ initiative: row, open: true })
        }}
        onDelete={(row) => {
          setDeleteFromSheet(false)
          setViewing((t) => (t ? { ...t, open: false } : t))
          setDeleting({ initiative: row, open: true })
        }}
      />
      <DeleteDialog
        target={deleting}
        finalFocus={deleteFromSheet ? backToCard : undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting((t) => (t ? { ...t, open: false } : t))
        }}
        onConfirm={(row) => {
          removeInitiative(row.id)
          setDeleting((t) => (t ? { ...t, open: false } : t))
          if (deleteFromSheet) {
            requestAnimationFrame(() => {
              const next = afterDelete()
              next?.focus()
              setDeleteFromSheet(false)
            })
          }
        }}
      />
    </div>
  )
}
