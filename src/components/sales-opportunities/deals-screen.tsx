"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PresentationIcon,
  Trash2Icon,
} from "lucide-react"

import { formatDayShort, formatRelative } from "@/lib/clock"
import { formatCurrency } from "@/lib/metrics"
import {
  DEAL_FILTERS,
  DEAL_FILTER_LABELS,
  DEFAULT_DEAL_SORT,
  LAST_TOUCH_STYLE,
  STAGES,
  STAGE_CONFIG,
  countByFilter,
  describeDue,
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { CELL, HEAD, Pill, SortableHead, TableCard } from "@/components/table-bits"
import { ResponsiveTable, RowCollapse } from "@/components/responsive-table"
import { SampleDataTag } from "@/components/sample-data"
import {
  AddDealDialog,
  DeleteDealDialog,
  EditDealDialog,
  NextStepDoneDialog,
  type DialogControl,
} from "@/components/sales-opportunities/deal-dialogs"
import { useDeals } from "@/components/sales-opportunities/deals-store"

/* ----------------------------------------------------------------- stage */

type PillTone = "plan" | "annual" | "muted" | "good"

/**
 * Shared `Pill` tones only — table-bits has no `lost`. Closed-lost maps to
 * `muted` (an existing text-safe tone) and the danger colour is applied
 * locally so we do not edit the shared primitive.
 */
function stagePillTone(stage: Stage): PillTone {
  const tone = STAGE_CONFIG[stage].tone
  return tone === "lost" ? "muted" : tone
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Pill
      tone={stagePillTone(stage)}
      className={cn(STAGE_CONFIG[stage].tone === "lost" && "bg-destructive/10 text-danger-text", className)}
    >
      {STAGE_CONFIG[stage].label}
    </Pill>
  )
}

/**
 * The stage pill is the control: open it to move the deal along. `row` is
 * the phone sheet's 48px "Move stage" row, with the same pill and menu.
 */
function StageMenu({ deal, variant = "pill" }: { deal: Deal; variant?: "pill" | "row" }) {
  const { setStage } = useDeals()
  return (
    <DropdownMenu>
      {variant === "row" ? (
        <DropdownMenuTrigger render={<button type="button" className={SHEET_ACTION} />}>
          <ChevronsUpDownIcon className="size-4" aria-hidden />
          <span className="flex-1">Move stage</span>
          <span className="inline-flex items-center gap-1">
            <StageBadge stage={deal.stage} />
            <ChevronDownIcon className="text-faint-foreground size-3" aria-hidden />
          </span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Stage: ${STAGE_CONFIG[deal.stage].label}`}
              title="Change stage"
              className="focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full focus-visible:ring-[3px] focus-visible:outline-none max-xl:min-h-11"
            />
          }
        >
          <StageBadge stage={deal.stage} />
          <ChevronDownIcon className="text-faint-foreground size-3" aria-hidden />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent className="w-44">
        <DropdownMenuRadioGroup
          value={deal.stage}
          onValueChange={(value) => {
            if (isStage(value)) setStage(deal.id, value)
          }}
        >
          {STAGES.map((s) => (
            // 44px rows below 1280, where this menu opens from the tablet pill and the phone sheet.
            <DropdownMenuRadioItem key={s} value={s} closeOnClick className={STAGE_ITEM}>
              {STAGE_CONFIG[s].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------ cells */

/**
 * Who, with org and the sample tag. On tablet (768–1279) the Owner and Last
 * touch columns fold in here as a third line (Deke 9:939) and the tag drops
 * below it; desktop keeps them as columns.
 */
function WhoCell({ deal, lastTouch }: { deal: Deal; lastTouch: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-label font-semibold tracking-tight">{deal.who}</p>
      <p className="text-caption text-muted-foreground flex flex-wrap items-center gap-1.5 md:max-xl:contents">
        <span>{deal.org}</span>
        {/* Seed rows carry the tag; a deal you add is yours and does not. */}
        {deal.sample && (
          <SampleDataTag className="h-4 px-1 text-[10px] md:max-xl:order-last md:max-xl:mt-1 md:max-xl:self-start" />
        )}
      </p>
      <p className="text-caption text-muted-foreground hidden md:max-xl:block">{`${deal.owner} · ${lastTouch}`}</p>
    </div>
  )
}

/**
 * "Next step · date · Overdue 2 days" — the one-line form for the phone card
 * and sheet. The card drops the year ("5 Oct", Deke 9:339) so the relative
 * part is not cut off; the sheet keeps the full date.
 */
function nextStepLine(deal: Deal, today: string, { short = false }: { short?: boolean } = {}) {
  const due = describeDue(deal, today)
  if (!due) return `${deal.nextStep} · No date`
  const date = short && deal.nextStepDue ? formatDayShort(deal.nextStepDue) : due.date
  // A closed deal is not late or early; the date alone is the record.
  if (STAGE_CONFIG[deal.stage].closed) return `${deal.nextStep} · ${date}`
  return `${deal.nextStep} · ${date} · ${due.relative}`
}

/** "Org · What they're buying · Value", honest about a value nobody knows yet. */
function dealLine(deal: Deal) {
  const value = deal.value === null ? "Value not known yet" : formatCurrency(deal.value)
  return `${deal.org} · ${deal.what} · ${value}`
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
            due.overdue && !closed ? "text-danger-text font-semibold" : "text-muted-foreground"
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
      className="bg-surface rounded-lg max-md:w-full!"
    >
      {DEAL_FILTERS.map((f) => (
        <ToggleGroupItem
          key={f}
          value={f}
          size="sm"
          className={cn(
            "text-label px-3 first:rounded-l-lg last:rounded-r-lg max-md:flex-1 max-xl:h-11! max-xl:min-w-11!",
            FILTER_PRESSED
          )}
        >
          {DEAL_FILTER_LABELS[f]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The picked view reads at a glance: pressed is solid primary (≥3:1 against
 * the unpressed segments, light and dark), at every width — as Community
 * Development, Clinics and Feature Request do. `!` beats Nova's unlayered
 * `aria-pressed:bg-muted`.
 */
const FILTER_PRESSED = "aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"

/** Where deals will come from once Clinics is real. A slot, not a control. */
function FromClinicsChip() {
  return (
    <span
      aria-disabled="true"
      data-testid="source-chip"
      title="Clinics will be able to spawn a deal here. Not wired yet"
      className="bg-surface border-surface-border text-muted-foreground text-caption inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed px-3 font-medium select-none max-xl:h-11"
    >
      <PresentationIcon className="size-3.5" aria-hidden />
      From Clinics (soon)
    </span>
  )
}

/* ------------------------------------------------------ row actions */

type DealAction = "done" | "edit" | "delete"

/**
 * The row's existing dialogs, opened from the tablet row menu or the phone
 * sheet instead of their own icon buttons. `action` says which one is open.
 */
function DealActionDialogs({
  deal,
  action,
  onClose,
  finalFocus,
}: {
  deal: Deal
  action: DealAction | null
  onClose: () => void
  finalFocus?: DialogControl["finalFocus"]
}) {
  const close = (open: boolean) => {
    if (!open) onClose()
  }
  const control = { trigger: null, onOpenChange: close, finalFocus }
  return (
    <>
      <NextStepDoneDialog deal={deal} open={action === "done"} {...control} />
      <EditDealDialog deal={deal} open={action === "edit"} {...control} />
      <DeleteDealDialog deal={deal} open={action === "delete"} {...control} />
    </>
  )
}

/**
 * Open a dialog only once the menu or sheet that asked for it has finished
 * closing, so their focus return cannot steal focus from the dialog.
 */
function useDeferredAction() {
  const [action, setAction] = React.useState<DealAction | null>(null)
  const queued = React.useRef<DealAction | null>(null)
  return {
    action,
    queue: (next: DealAction) => {
      queued.current = next
    },
    flush: () => {
      if (queued.current) setAction(queued.current)
      queued.current = null
    },
    clear: () => setAction(null),
  }
}

/** Tablet (768–1279): one 44×44 ellipsis for the three inline row actions. */
function RowMenu({ deal }: { deal: Deal }) {
  const { action, queue, flush, clear } = useDeferredAction()
  return (
    <>
      <DropdownMenu
        onOpenChangeComplete={(open) => {
          if (!open) flush()
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${deal.who}`}
              title="More actions"
              className="text-muted-foreground size-11!"
            />
          }
        >
          <MoreHorizontalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem className="min-h-11" onClick={() => queue("done")}>
            <CheckIcon aria-hidden />
            Next step done
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={() => queue("edit")}>
            <PencilIcon aria-hidden />
            Edit deal
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" variant="destructive" onClick={() => queue("delete")}>
            <Trash2Icon aria-hidden />
            Delete deal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DealActionDialogs deal={deal} action={action} onClose={clear} />
    </>
  )
}

/** Stage menu rows: 44px below 1280 (tablet pill, phone sheet); desktop keeps Nova's rows. */
const STAGE_ITEM = "max-xl:min-h-11"

/**
 * The stock Nova × (`cn-sheet-close`, top-3 right-3) as a 44×44 hit below
 * 1280; `!` beats Nova's unlayered `icon-sm` size. The header pads right so
 * its text never runs under it.
 */
const SHEET_CLOSE = "max-xl:[&>[data-slot=sheet-close]]:size-11!"

const SHEET_ACTION =
  "hover:bg-muted focus-visible:ring-ring/50 flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"

/**
 * Phone (<768): the card's detail and actions as a bottom sheet (Deke 9:530).
 * The ✓ row keeps the table's "Next step done" action; every row opens the
 * same dialogs the desktop icons do. The stock Nova × closes it, grown to a
 * 44px hit below 1280.
 */
function DealSheet({
  deal: current,
  open,
  onOpenChange,
  returnFocus,
  afterDelete,
}: {
  deal: Deal | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: React.RefObject<HTMLElement | null>
  /** Where focus goes once the deal (and its card) is gone. */
  afterDelete: () => HTMLElement | null
}) {
  const { today, nowMs } = useDeals()
  const { action, queue, flush, clear } = useDeferredAction()
  // Keep the last deal shown so a Delete confirm can finish closing (and hand
  // focus on) after the deal itself has left the store.
  const [shown, setShown] = React.useState(current)
  if (current && current !== shown) setShown(current)
  const deal = current ?? shown
  if (!deal) return null
  const late = isOverdue(deal, today)
  const pick = (next: DealAction) => () => {
    queue(next)
    onOpenChange(false)
  }
  // Back to the card the sheet came from — or, once it is deleted, the next
  // card (else the list heading).
  const backToCard = () => {
    const card = returnFocus.current
    return card?.isConnected ? card : (afterDelete() ?? true)
  }
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={(next) => {
          if (!next) flush()
        }}
      >
        <SheetContent
          side="bottom"
          finalFocus={backToCard}
          onKeyDown={wrapTab}
          className={cn(
            "max-h-[90dvh] gap-3 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]",
            SHEET_CLOSE
          )}
        >
          <div aria-hidden className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />
          <SheetHeader className="gap-1 px-4 pt-0 pb-0 max-xl:pr-14">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-body font-semibold tracking-tight">{deal.who}</SheetTitle>
              <StageBadge stage={deal.stage} />
            </div>
            <SheetDescription className="text-caption text-muted-foreground">{dealLine(deal)}</SheetDescription>
            <p className="text-caption text-muted-foreground">
              Owner {deal.owner} · Last touch{" "}
              {formatRelative(Date.parse(deal.lastTouch), nowMs, { style: LAST_TOUCH_STYLE })}
            </p>
            <p
              className={cn(
                "text-caption flex items-start gap-1",
                late ? "text-danger-text font-semibold" : "text-muted-foreground"
              )}
              data-overdue={late ? "true" : undefined}
            >
              {late && <AlertCircleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />}
              <span>{nextStepLine(deal, today)}</span>
            </p>
          </SheetHeader>
          <div role="group" aria-label="Deal actions" className="flex flex-col px-2 pb-2">
            <StageMenu deal={deal} variant="row" />
            <button type="button" className={SHEET_ACTION} onClick={pick("done")}>
              <CheckIcon className="size-4" aria-hidden />
              Next step done
            </button>
            <button type="button" className={SHEET_ACTION} onClick={pick("edit")}>
              <PencilIcon className="size-4" aria-hidden />
              Edit deal
            </button>
            <button type="button" className={cn(SHEET_ACTION, "text-danger-text")} onClick={pick("delete")}>
              <Trash2Icon className="size-4" aria-hidden />
              Delete deal
            </button>
          </div>
        </SheetContent>
      </Sheet>
      {/* A dialog queued from here opens after the sheet closes; it returns to the card too. */}
      <DealActionDialogs deal={deal} action={action} onClose={clear} finalFocus={backToCard} />
    </>
  )
}

/**
 * Base UI wraps Tab at the sheet's ends through a focus guard and a
 * requestAnimationFrame, so for a frame focus sits outside the sheet. Wrap
 * synchronously instead: Tab on the last control goes to the first, Shift+Tab
 * on the first goes to the last.
 */
function wrapTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return
  const tabbable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => el.getClientRects().length > 0)
  if (tabbable.length === 0) return
  const first = tabbable[0]
  const last = tabbable[tabbable.length - 1]
  const target = event.shiftKey
    ? document.activeElement === first && last
    : document.activeElement === last && first
  if (!target) return
  event.preventDefault()
  target.focus()
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

/** Tablet (768–1279) folds What / Owner / Last touch into Who and Value. */
const TABLET_HIDE = "md:max-xl:hidden"
/**
 * Tablet cells wrap so five columns fit 768px without scrolling the actions
 * off; `!` beats Nova's unlayered `.cn-table-cell` nowrap.
 */
const TABLET_WRAP = "md:max-xl:[&>td]:whitespace-normal!"
/** Tablet sort headers are 44×44 hits. */
const TABLET_SORT = "md:max-xl:py-1 md:max-xl:[&>button]:min-h-11 md:max-xl:[&>button]:min-w-11"

const FILTER_TITLE: Record<DealFilter, string> = {
  open: "Open deals",
  won: "Won",
  lost: "Lost",
  all: "All deals",
}

export function DealsScreen() {
  const { deals, today, nowMs, persisted } = useDeals()
  const [filter, setFilter] = React.useState<DealFilter>("open")
  const [sort, setSort] = React.useState<DealSort>(DEFAULT_DEAL_SORT)

  const counts = countByFilter(deals)
  const visible = sortDeals(
    deals.filter((d) => matchesDealFilter(d, filter)),
    sort
  )
  const overdue = visible.filter((d) => isOverdue(d, today)).length

  // Phone sheet: which deal, and the card to hand focus back to.
  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const lastCard = React.useRef<HTMLElement | null>(null)
  const lastCardIndex = React.useRef(0)
  const sectionRef = React.useRef<HTMLElement | null>(null)
  // After Delete from the sheet: the card now in its place, else the one
  // before it, else the list heading, else the picked filter.
  const afterDelete = () => {
    const section = sectionRef.current
    if (!section) return null
    const remaining = Array.from(section.querySelectorAll<HTMLElement>("[data-slot='row-collapse']"))
    return (
      remaining[Math.min(lastCardIndex.current, remaining.length - 1)] ??
      section.querySelector<HTMLElement>("[data-deals-heading]") ??
      section.querySelector<HTMLElement>("[aria-pressed='true']")
    )
  }
  const lastTouch = (deal: Deal) =>
    formatRelative(Date.parse(deal.lastTouch), nowMs, { style: LAST_TOUCH_STYLE })

  const onSort = (key: DealSortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "value" || key === "lastTouch" ? "desc" : "asc" }
    )

  return (
    <section ref={sectionRef} aria-label="Deals" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterGroup value={filter} onChange={setFilter} />
        <div className="flex flex-wrap items-center gap-2.5">
          <FromClinicsChip />
          {/* Phone puts Add deal in the page header (Deke 9:339). */}
          <span className="contents max-md:hidden">
            <AddDealDialog />
          </span>
        </div>
      </div>

      {!persisted ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} total={deals.length} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 data-deals-heading tabIndex={-1} className="text-label font-semibold tracking-tight">
              {FILTER_TITLE[filter]}
            </h2>
            <div className="flex items-center gap-2">
              {overdue > 0 && (
                <span className="text-micro text-danger-text inline-flex items-center gap-1 font-semibold">
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
            <ResponsiveTable
              layout="stack"
              className="[&_[role=listitem]:last-child>*]:border-b-0"
              onClickCapture={(event) => {
                const card = (event.target as Element).closest<HTMLElement>("[data-slot='row-collapse']")
                if (!card) return
                lastCard.current = card
                const all = Array.from(event.currentTarget.querySelectorAll("[data-slot='row-collapse']"))
                lastCardIndex.current = Math.max(0, all.indexOf(card))
              }}
              stacked={visible.map((deal) => (
                <RowCollapse
                  key={deal.id}
                  title={deal.who}
                  status={<StageBadge stage={deal.stage} />}
                  meta={[
                    { label: "Deal", value: dealLine(deal) },
                    { label: "Next step", value: nextStepLine(deal, today, { short: true }) },
                  ]}
                  sample={deal.sample}
                  attention={isOverdue(deal, today)}
                  // Overdue reads in the same text-safe danger token as the table's due line;
                  // the tag keeps its own width instead of stretching across the card.
                  className="[&_.text-destructive]:text-danger-text [&_[data-testid=sample-data-tag]]:self-start"
                  onClick={() => {
                    setSheetId(deal.id)
                    setSheetOpen(true)
                  }}
                />
              ))}
            >
            <Table aria-label="Deals">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead column="who" sort={sort} onSort={onSort} className={TABLET_SORT}>
                    Who
                  </SortableHead>
                  <TableHead className={cn(HEAD, TABLET_HIDE)}>What they&apos;re buying</TableHead>
                  <SortableHead column="value" sort={sort} onSort={onSort} align="right" className={TABLET_SORT}>
                    Value
                  </SortableHead>
                  <SortableHead column="stage" sort={sort} onSort={onSort} className={TABLET_SORT}>
                    Stage
                  </SortableHead>
                  <SortableHead column="nextStepDue" sort={sort} onSort={onSort} className={TABLET_SORT}>
                    Next step
                  </SortableHead>
                  <SortableHead column="owner" sort={sort} onSort={onSort} className={TABLET_HIDE}>
                    Owner
                  </SortableHead>
                  <SortableHead column="lastTouch" sort={sort} onSort={onSort} className={TABLET_HIDE}>
                    Last touch
                  </SortableHead>
                  <TableHead className={`${HEAD} w-28 md:max-xl:w-14`}>
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
                      className={cn("group/row hover:bg-transparent", late && "bg-destructive/[0.03]", TABLET_WRAP)}
                    >
                      <TableCell className={CELL}>
                        <WhoCell deal={deal} lastTouch={lastTouch(deal)} />
                      </TableCell>
                      <TableCell className={cn(CELL, TABLET_HIDE)}>{deal.what}</TableCell>
                      <TableCell className={`${CELL} text-right font-semibold tracking-tight tabular-nums`}>
                        {deal.value === null ? (
                          <span className="text-muted-foreground font-normal" title="Value not known yet">
                            —<span className="sr-only">Value not known yet</span>
                          </span>
                        ) : (
                          formatCurrency(deal.value)
                        )}
                        <span className="text-caption text-muted-foreground mt-0.5 hidden font-normal tracking-normal md:max-xl:block">
                          {deal.what}
                        </span>
                      </TableCell>
                      <TableCell className={CELL}>
                        <StageMenu deal={deal} />
                      </TableCell>
                      <TableCell className={`${CELL} max-w-[280px]`}>
                        <NextStepCell deal={deal} today={today} />
                      </TableCell>
                      <TableCell className={cn(CELL, TABLET_HIDE)}>{deal.owner}</TableCell>
                      <TableCell className={cn(CELL, "text-muted-foreground", TABLET_HIDE)}>
                        <span title={formatCentralDateTime(deal.lastTouch)}>{lastTouch(deal)}</span>
                      </TableCell>
                      <TableCell className={`${CELL} py-2 pr-3 pl-0 text-right`}>
                        <div className="inline-flex items-center gap-0.5 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 hover:opacity-100 md:max-xl:hidden">
                          <NextStepDoneDialog deal={deal} />
                          <EditDealDialog deal={deal} />
                          <DeleteDealDialog deal={deal} />
                        </div>
                        <span className="hidden md:max-xl:inline-flex">
                          <RowMenu deal={deal} />
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </ResponsiveTable>
          </TableCard>
        </div>
      )}
      <DealSheet
        deal={deals.find((d) => d.id === sheetId)}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        returnFocus={lastCard}
        afterDelete={afterDelete}
      />
    </section>
  )
}
