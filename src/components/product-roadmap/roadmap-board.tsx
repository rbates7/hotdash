"use client"

import * as React from "react"
import { FlaskConicalIcon, RouteIcon } from "lucide-react"

import {
  COLUMN_CONFIG,
  COLUMN_ORDER,
  inColumn,
  type RoadmapColumn,
} from "@/lib/roadmap/roadmap"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EditBetDialog, type BetCloseReason } from "@/components/product-roadmap/item-dialog"
import { RoadmapCard, type FocusRequest } from "@/components/product-roadmap/roadmap-card"
import {
  ROADMAP_BOARD_DESKTOP,
  ROADMAP_BOARD_PHONE,
  ROADMAP_BOARD_TABLET,
  ROADMAP_COMPACT_BOARD_QUERY,
  ROADMAP_PRESSED,
  ROADMAP_SEGMENT,
  ROADMAP_SWITCHER,
} from "@/components/product-roadmap/responsive"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { SAMPLE_DATA_LABEL, SAMPLE_SURFACE } from "@/components/sample-data"
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile"

/**
 * The page-wide notice above the board. The shared `SampleDataNotice` is
 * worded for Metrics, so this one says what is and is not real *here*, on
 * the shared sample-data surface so the palette (and its contrast) is the
 * same everywhere.
 */
function RoadmapSampleNotice({ count }: { count: number }) {
  return (
    <div
      role="note"
      aria-label={SAMPLE_DATA_LABEL}
      data-testid="sample-data-notice"
      className={cn(
        "text-body flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5",
        SAMPLE_SURFACE
      )}
    >
      <FlaskConicalIcon className="mt-0.5 size-4 flex-none" aria-hidden />
      <p>
        <strong className="font-semibold">{SAMPLE_DATA_LABEL}.</strong> The{" "}
        {count === 1 ? "bet" : `${count} bets`} tagged below{" "}
        {count === 1 ? "is an" : "are"} invented example{count === 1 ? "" : "s"} of a
        Chlk roadmap, not signed bets. Bets you add or rewrite are yours, and they live
        only in this browser.
      </p>
    </div>
  )
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span className={className}>
      {count}
      <span className="sr-only"> bets</span>
    </span>
  )
}

function ColumnHead({ column, count }: { column: RoadmapColumn; count: number }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2 px-0.5 pb-0.5">
      <h2
        className="text-label font-semibold tracking-tight"
        title={COLUMN_CONFIG[column].description}
      >
        {COLUMN_CONFIG[column].label}
      </h2>
      <CountBadge
        count={count}
        className="bg-muted text-micro text-muted-foreground grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
      />
    </div>
  )
}

function boardClass(layout: "phone" | "tablet" | "desktop") {
  if (layout === "phone") return ROADMAP_BOARD_PHONE
  if (layout === "tablet") return ROADMAP_BOARD_TABLET
  return ROADMAP_BOARD_DESKTOP
}

function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    [query]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

function useCompact() {
  const phone = useIsMobile()
  const tablet = useIsTablet()
  return phone || tablet
}

/** Phone / 820-layout (768–1179) / three columns (≥1180). Local query — do not edit use-mobile. */
function useBoardLayout(): "phone" | "tablet" | "desktop" {
  const phone = useIsMobile()
  const compactBoard = useMediaQuery(ROADMAP_COMPACT_BOARD_QUERY)
  if (phone) return "phone"
  if (compactBoard) return "tablet"
  return "desktop"
}

function ColumnSwitcher({
  selected,
  onSelect,
  counts,
}: {
  selected: RoadmapColumn
  onSelect: (column: RoadmapColumn) => void
  counts: Record<RoadmapColumn, number>
}) {
  return (
    <ToggleGroup
      aria-label="Filter by column"
      variant="outline"
      size="sm"
      spacing={0}
      value={[selected]}
      onValueChange={(next) => {
        const value = next[0]
        if (value === "now" || value === "next" || value === "later") onSelect(value)
      }}
      className={ROADMAP_SWITCHER}
    >
      {COLUMN_ORDER.map((column) => {
        const count = counts[column]
        return (
          <ToggleGroupItem
            key={column}
            value={column}
            className={cn(ROADMAP_SEGMENT, ROADMAP_PRESSED)}
          >
            {COLUMN_CONFIG[column].label}
            <CountBadge count={count} className="text-caption font-semibold tabular-nums" />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

function Column({
  column,
  cards,
  listed,
  onEdit,
  focusRequest,
  onMoved,
  onFocusConsumed,
}: {
  column: RoadmapColumn
  cards: ReturnType<typeof inColumn>
  listed?: boolean
  onEdit: (id: string) => void
  focusRequest: FocusRequest | null
  onMoved: (request: FocusRequest) => void
  onFocusConsumed: () => void
}) {
  const body =
    cards.length === 0 ? (
      <p className="border-border text-caption text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center">
        Nothing in {COLUMN_CONFIG[column].label}
      </p>
    ) : listed ? (
      <div role="list" className="contents">
        {cards.map((card, index) => (
          <div key={card.id} role="listitem" className="min-w-0">
            <RoadmapCard
              item={card}
              index={index}
              count={cards.length}
              onEdit={onEdit}
              focusRequest={focusRequest}
              onMoved={onMoved}
              onFocusConsumed={onFocusConsumed}
            />
          </div>
        ))}
      </div>
    ) : (
      cards.map((card, index) => (
        <RoadmapCard
          key={card.id}
          item={card}
          index={index}
          count={cards.length}
          onEdit={onEdit}
          focusRequest={focusRequest}
          onMoved={onMoved}
          onFocusConsumed={onFocusConsumed}
        />
      ))
    )

  return (
    <section
      aria-label={COLUMN_CONFIG[column].label}
      data-roadmap-column={column}
      tabIndex={-1}
      className={cn(
        listed ? "contents" : "flex min-w-0 flex-col gap-2.5",
        "outline-none"
      )}
    >
      {listed ? null : <ColumnHead column={column} count={cards.length} />}
      {body}
    </section>
  )
}

/** Grey blocks while localStorage is being read. Column count matches the layout. */
export function BoardSkeleton({
  layout = "desktop",
}: {
  layout?: "phone" | "tablet" | "desktop"
}) {
  const columns = layout === "phone" ? 1 : layout === "tablet" ? 2 : 3
  return (
    <div
      role="status"
      aria-label="Loading saved bets"
      aria-busy
      className={boardClass(layout)}
    >
      {Array.from({ length: columns }, (_, col) => (
        <div key={col} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-0.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          {Array.from({ length: col < 2 ? 3 : 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border-surface-border flex flex-col gap-2.5 rounded-xl border px-3.5 pt-3.5 pb-3"
            >
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="mt-1 flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="mt-1 h-6 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function RoadmapBoard() {
  const { items, persisted } = useRoadmap()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [phoneColumn, setPhoneColumn] = React.useState<RoadmapColumn>("now")
  const [focusRequest, setFocusRequest] = React.useState<FocusRequest | null>(null)
  const layout = useBoardLayout()
  const compact = useCompact()
  const pendingFocus = React.useRef<
    { kind: "card"; id: string } | { kind: "column"; column: RoadmapColumn } | null
  >(null)
  const closingId = React.useRef<string | null>(null)
  const onMoved = React.useCallback((request: FocusRequest) => setFocusRequest(request), [])
  const onFocusConsumed = React.useCallback(() => setFocusRequest(null), [])

  function rememberNeighbor(id: string) {
    const current = items.find((item) => item.id === id)
    if (!current) return
    const col = inColumn(items, current.column)
    const idx = col.findIndex((item) => item.id === id)
    const next = col[idx + 1] ?? col[idx - 1]
    pendingFocus.current = next
      ? { kind: "card", id: next.id }
      : { kind: "column", column: current.column }
  }

  function resolvePendingFocus() {
    const pending = pendingFocus.current
    if (!pending) return document.querySelector<HTMLElement>("[data-roadmap-heading]")
    const cardEl =
      pending.kind === "card"
        ? document.querySelector<HTMLElement>(`[data-roadmap-card="${pending.id}"]`)
        : null
    const columnEl =
      pending.kind === "column"
        ? document.querySelector<HTMLElement>(`[data-roadmap-column="${pending.column}"]`)
        : null
    const listedHeading =
      pending.kind === "column"
        ? document.querySelector<HTMLElement>(
            `[data-roadmap-column-heading="${pending.column}"]`
          )
        : null
    const heading = document.querySelector<HTMLElement>("[data-roadmap-heading]")
    const columnCanTakeFocus = columnEl && !columnEl.classList.contains("contents")
    return cardEl ?? (columnCanTakeFocus ? columnEl : null) ?? listedHeading ?? heading
  }

  function openEdit(id: string) {
    setEditingId(id)
  }

  function handleClose(reason: BetCloseReason = "dismiss") {
    if (!editingId || closingId.current === editingId) return
    closingId.current = editingId
    if (compact) {
      if (reason === "delete" || reason === "move") rememberNeighbor(editingId)
      else pendingFocus.current = { kind: "card", id: editingId }
    } else {
      pendingFocus.current = null
    }
    setEditingId(null)
  }

  React.useLayoutEffect(() => {
    if (editingId) closingId.current = null
  }, [editingId])

  React.useLayoutEffect(() => {
    if (!compact || editingId || !pendingFocus.current || !persisted) return
    resolvePendingFocus()?.focus()
  }, [compact, editingId, persisted])

  React.useEffect(() => {
    if (!compact || editingId || !pendingFocus.current || !persisted) return
    const id = window.setTimeout(() => {
      resolvePendingFocus()?.focus()
      pendingFocus.current = null
    }, 0)
    return () => window.clearTimeout(id)
  }, [compact, editingId, persisted])

  if (!persisted) return <BoardSkeleton layout={layout} />

  const sampleCount = items.filter((i) => i.sample).length
  const editing = items.find((i) => i.id === editingId) ?? null
  const counts = Object.fromEntries(
    COLUMN_ORDER.map((column) => [column, inColumn(items, column).length])
  ) as Record<RoadmapColumn, number>

  const filtered = layout === "desktop" ? COLUMN_ORDER : [phoneColumn]
  const listed = layout !== "desktop"

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {sampleCount > 0 && <RoadmapSampleNotice count={sampleCount} />}

      {items.length === 0 && (
        <div
          role="status"
          aria-label="Empty board"
          className="border-border text-body text-muted-foreground flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3"
        >
          <RouteIcon className="size-4 flex-none" aria-hidden />
          <p>
            No bets on the roadmap. Add the next signed bet with{" "}
            <strong className="text-foreground font-medium">New bet</strong>, or{" "}
            <strong className="text-foreground font-medium">Reset</strong> to bring the sample
            bets back.
          </p>
        </div>
      )}

      {layout !== "desktop" && (
        <>
          <h2
            data-roadmap-column-heading={phoneColumn}
            tabIndex={-1}
            className="sr-only"
          >
            {COLUMN_CONFIG[phoneColumn].label}
          </h2>
          <ColumnSwitcher selected={phoneColumn} onSelect={setPhoneColumn} counts={counts} />
        </>
      )}

      <div
        role="region"
        aria-label="Roadmap sequence"
        className={boardClass(layout)}
      >
        {filtered.map((column) => (
          <Column
            key={column}
            column={column}
            cards={inColumn(items, column)}
            listed={listed}
            onEdit={openEdit}
            focusRequest={focusRequest}
            onMoved={onMoved}
            onFocusConsumed={onFocusConsumed}
          />
        ))}
      </div>

      <EditBetDialog item={editing} onClose={handleClose} />
    </div>
  )
}
