"use client"

import * as React from "react"
import { RouteIcon } from "lucide-react"

import {
  COLUMN_CONFIG,
  COLUMN_ORDER,
  inColumn,
  type RoadmapColumn,
} from "@/lib/roadmap/roadmap"
import { Skeleton } from "@/components/ui/skeleton"
import { EditBetDialog } from "@/components/product-roadmap/item-dialog"
import { RoadmapCard } from "@/components/product-roadmap/roadmap-card"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { SampleDataNotice } from "@/components/product-roadmap/sample-data"

function ColumnHead({ column, count }: { column: RoadmapColumn; count: number }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2 px-0.5 pb-0.5">
      <h2
        className="text-label font-semibold tracking-tight"
        title={COLUMN_CONFIG[column].description}
      >
        {COLUMN_CONFIG[column].label}
      </h2>
      <span
        aria-label={`${count} ${count === 1 ? "bet" : "bets"}`}
        className="bg-muted text-micro text-muted-foreground grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
      >
        {count}
      </span>
    </div>
  )
}

/** Three columns of grey blocks while localStorage is being read. */
export function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading saved bets"
      aria-busy
      className="grid grid-cols-3 items-start gap-3.5"
    >
      {COLUMN_ORDER.map((column, col) => (
        <div key={column} className="flex flex-col gap-2.5">
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

  if (!persisted) return <BoardSkeleton />

  const sampleCount = items.filter((i) => i.sample).length
  const editing = items.find((i) => i.id === editingId) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {sampleCount > 0 && <SampleDataNotice count={sampleCount} />}

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

      <div className="grid grid-cols-3 items-start gap-3.5" aria-label="Roadmap sequence">
        {COLUMN_ORDER.map((column) => {
          const cards = inColumn(items, column)
          return (
            <section
              key={column}
              aria-label={COLUMN_CONFIG[column].label}
              className="flex min-w-0 flex-col gap-2.5"
            >
              <ColumnHead column={column} count={cards.length} />
              {cards.length === 0 ? (
                <p className="border-border text-caption text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center">
                  Nothing in {COLUMN_CONFIG[column].label}
                </p>
              ) : (
                cards.map((card, index) => (
                  <RoadmapCard
                    key={card.id}
                    item={card}
                    index={index}
                    count={cards.length}
                    onEdit={setEditingId}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>

      <EditBetDialog item={editing} onClose={() => setEditingId(null)} />
    </div>
  )
}
