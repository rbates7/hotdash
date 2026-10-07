"use client"

import * as React from "react"
import { AlertCircleIcon, ChevronDownIcon, PresentationIcon } from "lucide-react"

import { formatCurrency } from "@/lib/metrics"
import {
  DEAL_FILTERS,
  DEAL_FILTER_LABELS,
  DEFAULT_DEAL_SORT,
  STAGES,
  STAGE_CONFIG,
  countByFilter,
  describeDue,
  describeLastTouch,
  formatCentralDateTime,
  isDealFilter,
  isOverdue,
  isStage,
  matchesDealFilter,
  sortDeals,
  type Deal,
  type DealFilter,
  type DealSort,
  type DealSortKey,
  type Stage,
} from "@/lib/sales-opportunities"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { CELL, HEAD, SortableHead, TableCard } from "@/components/metrics/table-bits"
import { SampleDataTag } from "@/components/sample-data"
import {
  AddDealDialog,
  DeleteDealDialog,
  EditDealDialog,
  NextStepDoneDialog,
} from "@/components/sales-opportunities/deal-dialogs"
import { useDeals } from "@/components/sales-opportunities/deals-store"

/* ----------------------------------------------------------------- stage */

const STAGE_BADGE: Record<Stage, string> = {
  talking: "border-border bg-transparent text-muted-foreground",
  proposal: "bg-muted text-foreground",
  verbal: "bg-info/10 text-info dark:bg-info/20",
  "closed-won": "bg-success/10 text-success dark:bg-success/20",
  "closed-lost": "bg-destructive/10 text-destructive dark:bg-destructive/20",
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("h-[22px] px-2 font-semibold tracking-tight", STAGE_BADGE[stage], className)}
    >
      {STAGE_CONFIG[stage].label}
    </Badge>
  )
}

/** The stage pill is the control: open it to move the deal along. */
function StageMenu({ deal }: { deal: Deal }) {
  const { setStage } = useDeals()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Stage: ${STAGE_CONFIG[deal.stage].label}`}
            title="Change stage"
            className="focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
          />
        }
      >
        <StageBadge stage={deal.stage} />
        <ChevronDownIcon className="text-faint-foreground size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuRadioGroup
          value={deal.stage}
          onValueChange={(value) => {
            if (isStage(value)) setStage(deal.id, value)
          }}
        >
          {STAGES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {STAGE_CONFIG[s].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------ cells */

function WhoCell({ deal }: { deal: Deal }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-label font-semibold tracking-tight">{deal.who}</p>
      <p className="text-caption text-muted-foreground flex flex-wrap items-center gap-1.5">
        <span>{deal.org}</span>
        {/* Seed rows carry the tag; a deal you add is yours and does not. */}
        {deal.sample && <SampleDataTag className="h-4 px-1 text-[10px]" />}
      </p>
    </div>
  )
}

function NextStepCell({ deal, today }: { deal: Deal; today: string }) {
  const due = describeDue(deal, today)
  const closed = STAGE_CONFIG[deal.stage].closed
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-label">{deal.nextStep}</p>
      {due ? (
        <p
          className={cn(
            "text-caption inline-flex items-center gap-1 tabular-nums",
            due.overdue && !closed ? "text-destructive font-semibold" : "text-muted-foreground"
          )}
          data-overdue={due.overdue && !closed ? "true" : undefined}
        >
          {due.overdue && !closed && <AlertCircleIcon className="size-3" aria-hidden />}
          <span>{due.date}</span>
          {/* A closed deal is not late or early; the date alone is the record. */}
          {!closed && (
            <>
              <span aria-hidden>·</span>
              <span>{due.relative}</span>
            </>
          )}
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">No date</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- toolbar */

function FilterGroup({
  value,
  onChange,
}: {
  value: DealFilter
  onChange: (next: DealFilter) => void
}) {
  return (
    <ToggleGroup
      aria-label="Show deals"
      value={[value]}
      onValueChange={(next) => {
        // Single-select: ignore the click that would clear the group.
        const picked = next.find(isDealFilter)
        if (picked && picked !== value) onChange(picked)
      }}
      variant="outline"
      spacing={0}
      className="bg-surface rounded-lg"
    >
      {DEAL_FILTERS.map((f) => (
        <ToggleGroupItem
          key={f}
          value={f}
          size="sm"
          className="text-label px-3 first:rounded-l-lg last:rounded-r-lg"
        >
          {DEAL_FILTER_LABELS[f]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Where deals will come from once Clinics is real. A slot, not a control. */
function FromClinicsChip() {
  return (
    <span
      aria-disabled="true"
      data-testid="source-chip"
      title="Clinics will be able to spawn a deal here. Not wired yet"
      className="bg-surface border-surface-border text-muted-foreground text-caption inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed px-3 font-medium select-none"
    >
      <PresentationIcon className="size-3.5" aria-hidden />
      From Clinics (soon)
    </span>
  )
}

/* ------------------------------------------------------------- states */

function TableSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading saved deals"
      className="bg-surface border-surface-border flex w-full flex-col gap-3 rounded-xl border p-[18px]"
    >
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function EmptyState({ filter, total }: { filter: DealFilter; total: number }) {
  const nothingAtAll = total === 0
  return (
    <div
      role="status"
      aria-label="No deals"
      className="bg-surface border-surface-border flex flex-col items-center gap-1.5 rounded-xl border px-6 py-14 text-center"
    >
      <p className="text-body font-semibold tracking-tight">
        {nothingAtAll ? "No live deals" : `No ${DEAL_FILTER_LABELS[filter].toLowerCase()} deals`}
      </p>
      <p className="text-label text-muted-foreground max-w-sm">
        {nothingAtAll
          ? "A hunt becomes a deal when someone is actually talking. Add one when they are."
          : "Nothing in this view. Switch the filter above to see the rest."}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- screen */

const FILTER_TITLE: Record<DealFilter, string> = {
  open: "Open deals",
  won: "Won",
  lost: "Lost",
  all: "All deals",
}

export function DealsScreen() {
  const { deals, today, persisted } = useDeals()
  const [filter, setFilter] = React.useState<DealFilter>("open")
  const [sort, setSort] = React.useState<DealSort>(DEFAULT_DEAL_SORT)

  const counts = countByFilter(deals)
  const visible = sortDeals(
    deals.filter((d) => matchesDealFilter(d, filter)),
    sort
  )
  const overdue = visible.filter((d) => isOverdue(d, today)).length

  const onSort = (key: DealSortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "value" || key === "lastTouch" ? "desc" : "asc" }
    )

  return (
    <section aria-label="Deals" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterGroup value={filter} onChange={setFilter} />
        <div className="flex flex-wrap items-center gap-2.5">
          <FromClinicsChip />
          <AddDealDialog />
        </div>
      </div>

      {!persisted ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} total={deals.length} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-label font-semibold tracking-tight">{FILTER_TITLE[filter]}</h2>
            <div className="flex items-center gap-2">
              {overdue > 0 && (
                <span className="text-micro text-destructive inline-flex items-center gap-1 font-semibold">
                  <AlertCircleIcon className="size-3" aria-hidden />
                  {overdue} overdue
                </span>
              )}
              <span
                className="bg-muted text-muted-foreground text-micro inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
                aria-label={`${counts[filter]} ${filter === "all" ? "deals" : `${filter} deals`}`}
              >
                {counts[filter]}
              </span>
            </div>
          </div>

          <TableCard note="Seed deals are invented; deals you add or change are saved in this browser.">
            <Table aria-label="Deals">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead column="who" sort={sort} onSort={onSort}>
                    Who
                  </SortableHead>
                  <TableHead className={HEAD}>What they&apos;re buying</TableHead>
                  <SortableHead column="value" sort={sort} onSort={onSort} align="right">
                    Value
                  </SortableHead>
                  <SortableHead column="stage" sort={sort} onSort={onSort}>
                    Stage
                  </SortableHead>
                  <SortableHead column="nextStepDue" sort={sort} onSort={onSort}>
                    Next step
                  </SortableHead>
                  <SortableHead column="owner" sort={sort} onSort={onSort}>
                    Owner
                  </SortableHead>
                  <SortableHead column="lastTouch" sort={sort} onSort={onSort}>
                    Last touch
                  </SortableHead>
                  <TableHead className={`${HEAD} w-28`}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((deal) => {
                  const late = isOverdue(deal, today)
                  return (
                    <TableRow
                      key={deal.id}
                      data-deal={deal.id}
                      data-overdue={late ? "true" : undefined}
                      className={cn("group/row hover:bg-transparent", late && "bg-destructive/[0.03]")}
                    >
                      <TableCell className={CELL}>
                        <WhoCell deal={deal} />
                      </TableCell>
                      <TableCell className={CELL}>{deal.what}</TableCell>
                      <TableCell className={`${CELL} text-right font-semibold tracking-tight tabular-nums`}>
                        {deal.value === null ? (
                          <span className="text-muted-foreground font-normal" title="Value not known yet">
                            —<span className="sr-only">Value not known yet</span>
                          </span>
                        ) : (
                          formatCurrency(deal.value)
                        )}
                      </TableCell>
                      <TableCell className={CELL}>
                        <StageMenu deal={deal} />
                      </TableCell>
                      <TableCell className={`${CELL} max-w-[280px]`}>
                        <NextStepCell deal={deal} today={today} />
                      </TableCell>
                      <TableCell className={CELL}>{deal.owner}</TableCell>
                      <TableCell className={`${CELL} text-muted-foreground`}>
                        <span title={formatCentralDateTime(deal.lastTouch)}>
                          {describeLastTouch(deal.lastTouch, today)}
                        </span>
                      </TableCell>
                      <TableCell className={`${CELL} py-2 pr-3 pl-0 text-right`}>
                        <div className="inline-flex items-center gap-0.5 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 hover:opacity-100">
                          <NextStepDoneDialog deal={deal} />
                          <EditDealDialog deal={deal} />
                          <DeleteDealDialog deal={deal} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      )}
    </section>
  )
}
