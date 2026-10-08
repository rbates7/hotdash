"use client"

import * as React from "react"
import { InboxIcon } from "lucide-react"

import {
  STATUS_CONFIG,
  STATUS_ORDER,
  byStatus,
  type FeatureStatus,
} from "@/lib/feature-requests/feature-requests"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import { EditIdeaDialog } from "@/components/feature-request/idea-dialog"
import { RequestCard } from "@/components/feature-request/request-card"
import {
  FR_BOARD_DESKTOP,
  FR_BOARD_PHONE,
  FR_BOARD_TABLET,
  FR_CHIP,
  FR_CHIP_COUNT,
  FR_CHIP_OFF,
  FR_CHIP_ON,
  FR_CHIPS,
} from "@/components/feature-request/responsive"
import { SampleDataNotice } from "@/components/sample-data"
import { useIsMobile, useIsTabletPortrait } from "@/hooks/use-mobile"

function ColumnHead({ status, count }: { status: FeatureStatus; count: number }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2 px-0.5 pb-0.5">
      <h2 className="text-label font-semibold tracking-tight">
        {STATUS_CONFIG[status].label}
      </h2>
      <span
        aria-label={`${count} ${count === 1 ? "idea" : "ideas"}`}
        className="bg-muted text-micro text-muted-foreground grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
      >
        {count}
      </span>
    </div>
  )
}

function boardClass(layout: "phone" | "tablet" | "desktop") {
  if (layout === "phone") return FR_BOARD_PHONE
  if (layout === "tablet") return FR_BOARD_TABLET
  return FR_BOARD_DESKTOP
}

function useBoardLayout(): "phone" | "tablet" | "desktop" {
  const phone = useIsMobile()
  const tabletPortrait = useIsTabletPortrait()
  if (phone) return "phone"
  if (tabletPortrait) return "tablet"
  return "desktop"
}

function StatusChips({
  selected,
  onSelect,
  counts,
}: {
  selected: FeatureStatus
  onSelect: (status: FeatureStatus) => void
  counts: Record<FeatureStatus, number>
}) {
  return (
    <div role="tablist" aria-label="Status" className={FR_CHIPS}>
      {STATUS_ORDER.map((status) => {
        const on = status === selected
        const count = counts[status]
        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={on}
            className={cn(FR_CHIP, on ? FR_CHIP_ON : FR_CHIP_OFF)}
            onClick={() => onSelect(status)}
          >
            {STATUS_CONFIG[status].label}
            <span
              aria-label={`${count} ${count === 1 ? "idea" : "ideas"}`}
              className={FR_CHIP_COUNT}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Column({
  status,
  cards,
  onOpen,
  listed,
}: {
  status: FeatureStatus
  cards: ReturnType<typeof byStatus>
  onOpen: (id: string) => void
  listed?: boolean
}) {
  const body =
    cards.length === 0 ? (
      <p className="border-border text-caption text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center">
        Nothing in {STATUS_CONFIG[status].label}
      </p>
    ) : listed ? (
      <div role="list" className="flex flex-col gap-2.5">
        {cards.map((card) => (
          <div key={card.id} role="listitem">
            <RequestCard request={card} onOpen={onOpen} />
          </div>
        ))}
      </div>
    ) : (
      cards.map((card) => <RequestCard key={card.id} request={card} onOpen={onOpen} />)
    )

  return (
    <section
      aria-label={STATUS_CONFIG[status].label}
      className="flex min-w-0 flex-col gap-2.5"
    >
      {listed ? null : <ColumnHead status={status} count={cards.length} />}
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
  const columns = layout === "phone" ? 1 : layout === "tablet" ? 2 : 4
  return (
    <div
      role="status"
      aria-label="Loading saved ideas"
      aria-busy
      className={boardClass(layout)}
    >
      {Array.from({ length: columns }, (_, col) => (
        <div key={col} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-0.5">
            <Skeleton className="h-4 w-20" />
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
                <Skeleton className="h-5 w-10 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function RequestBoard() {
  const { requests, persisted } = useFeatureRequests()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [phoneStatus, setPhoneStatus] = React.useState<FeatureStatus>("inbox")
  const layout = useBoardLayout()

  if (!persisted) return <BoardSkeleton layout={layout} />

  const sampleCount = requests.filter((r) => r.sample).length
  const open = requests.find((r) => r.id === openId) ?? null
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, byStatus(requests, status).length])
  ) as Record<FeatureStatus, number>

  const statuses = layout === "phone" ? [phoneStatus] : STATUS_ORDER

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {sampleCount > 0 && (
        <SampleDataNotice>
          The {sampleCount === 1 ? "card" : `${sampleCount} cards`} tagged below{" "}
          {sampleCount === 1 ? "is an" : "are"} invented example{sampleCount === 1 ? "" : "s"} of
          Dan&rsquo;s ideas, not real requests. Ideas you add or rewrite are yours, and they
          live only in this browser.
        </SampleDataNotice>
      )}

      {requests.length === 0 && (
        <div
          role="status"
          aria-label="Empty board"
          className="border-border text-body text-muted-foreground flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3"
        >
          <InboxIcon className="size-4 flex-none" aria-hidden />
          <p>
            Nothing on the board. Add Dan&rsquo;s next idea with{" "}
            <strong className="text-foreground font-medium">New idea</strong>, or{" "}
            <strong className="text-foreground font-medium">Reset</strong> to bring the
            sample cards back.
          </p>
        </div>
      )}

      {layout === "phone" && (
        <StatusChips selected={phoneStatus} onSelect={setPhoneStatus} counts={counts} />
      )}

      <div
        role="region"
        aria-label="Feature request intake"
        className={boardClass(layout)}
      >
        {statuses.map((status) => (
          <Column
            key={status}
            status={status}
            cards={byStatus(requests, status)}
            onOpen={setOpenId}
            listed={layout === "phone"}
          />
        ))}
      </div>

      <EditIdeaDialog request={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
