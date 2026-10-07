"use client"

import * as React from "react"
import { InboxIcon } from "lucide-react"

import {
  STATUS_CONFIG,
  STATUS_ORDER,
  byStatus,
  type FeatureStatus,
} from "@/lib/feature-requests/feature-requests"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import { EditIdeaDialog } from "@/components/feature-request/idea-dialog"
import { RequestCard } from "@/components/feature-request/request-card"
import { SampleDataNotice } from "@/components/feature-request/sample-data"

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

/** Four columns of grey blocks while localStorage is being read. */
export function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading saved ideas"
      aria-busy
      className="grid grid-cols-4 items-start gap-3.5"
    >
      {STATUS_ORDER.map((status, col) => (
        <div key={status} className="flex flex-col gap-2.5">
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

  if (!persisted) return <BoardSkeleton />

  const sampleCount = requests.filter((r) => r.sample).length
  const open = requests.find((r) => r.id === openId) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {sampleCount > 0 && <SampleDataNotice count={sampleCount} />}

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

      <div className="grid grid-cols-4 items-start gap-3.5" aria-label="Feature request intake">
        {STATUS_ORDER.map((status) => {
          const cards = byStatus(requests, status)
          return (
            <section
              key={status}
              aria-label={STATUS_CONFIG[status].label}
              className="flex min-w-0 flex-col gap-2.5"
            >
              <ColumnHead status={status} count={cards.length} />
              {cards.length === 0 ? (
                <p className="border-border text-caption text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center">
                  Nothing in {STATUS_CONFIG[status].label}
                </p>
              ) : (
                cards.map((card) => (
                  <RequestCard key={card.id} request={card} onOpen={setOpenId} />
                ))
              )}
            </section>
          )
        })}
      </div>

      <EditIdeaDialog request={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
