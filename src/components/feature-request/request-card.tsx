"use client"

import { ArrowRightIcon } from "lucide-react"

import { formatDate } from "@/lib/clock"
import type { FeatureRequest } from "@/lib/feature-requests/feature-requests"
import { cn } from "@/lib/utils"
import { SampleDataTag } from "@/components/sample-data"

export const ROADMAP_HINT_TITLE =
  "Shown on this board only. The Product Roadmap page isn't wired yet, so nothing has been sent anywhere."

/** One idea. Anatomy per the mock: title, ask, then who / when / hint. */
export function RequestCard({
  request,
  onOpen,
}: {
  request: FeatureRequest
  onOpen: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(request.id)}
      aria-label={`Open idea: ${request.title}`}
      className={cn(
        "bg-surface border-surface-border hover:border-foreground/15 hover:bg-surface-hover",
        "focus-visible:ring-ring/50 flex w-full min-w-0 flex-col gap-2 rounded-xl border px-3.5 pt-3.5 pb-3 text-left",
        "transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
      )}
    >
      <span className="text-label leading-[1.35] font-semibold tracking-tight">
        {request.title}
      </span>

      {request.ask && (
        <span className="text-caption text-muted-foreground leading-[1.45] tracking-tight">
          {request.ask}
        </span>
      )}

      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="bg-muted border-surface-border text-micro text-foreground inline-flex h-5 items-center rounded-full border px-2 font-medium whitespace-nowrap">
          {request.from}
        </span>
        <time
          dateTime={request.createdAt}
          className="text-micro text-muted-foreground font-medium whitespace-nowrap tabular-nums"
        >
          {formatDate(new Date(request.createdAt))}
        </time>
        {request.sample && <SampleDataTag />}
        {request.status === "roadmap" && (
          <span
            title={ROADMAP_HINT_TITLE}
            className="bg-muted text-foreground/80 ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-[3px] text-[10px] leading-[1.2] font-semibold whitespace-nowrap"
          >
            <ArrowRightIcon className="size-2.5" aria-hidden />
            Roadmap
          </span>
        )}
      </div>
    </button>
  )
}
