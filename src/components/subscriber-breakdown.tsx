import { AlertTriangleIcon } from "lucide-react"

import type { SubscriberBreakdownView } from "@/lib/live-metrics"
import { APP_STORE_NOT_CONNECTED_TEXT, BREAKDOWN_LABELS } from "@/lib/subscriber-total"
import { cn } from "@/lib/utils"

/** Same rows, dashes for figures: holds the breakdown's height while there is none. */
const PLACEHOLDER: SubscriberBreakdownView = {
  rows: (Object.keys(BREAKDOWN_LABELS) as (keyof typeof BREAKDOWN_LABELS)[]).map((key) => ({
    key,
    label: BREAKDOWN_LABELS[key],
    value: "–",
  })),
  note: null,
}

/**
 * The three groups under a Subscribers total — Stripe paying, App Store,
 * free accounts — and the fine print when the total leaves the App Store
 * out. A row whose figure is suspect (an App Store read of 0) is amber,
 * with a warning icon that says so to a screen reader. The note's line is always there (blank when there is nothing to
 * say), so the block is one height whatever the sources answer.
 *
 * `reserve` paints nothing (sample or loading), but takes the same room,
 * so a card does not grow when Stripe's figures land.
 */
export function SubscriberBreakdown({
  breakdown,
  reserve = false,
  className,
}: {
  breakdown?: SubscriberBreakdownView
  reserve?: boolean
  className?: string
}) {
  const view = reserve || !breakdown ? PLACEHOLDER : breakdown
  return (
    <div
      aria-hidden={reserve || undefined}
      data-testid={reserve ? "subscriber-breakdown-reserve" : "subscriber-breakdown"}
      className={cn("text-caption tracking-tight", reserve && "invisible", className)}
    >
      <dl className="flex flex-col gap-0.5">
        {view.rows.map((row) => {
          const off = row.value === APP_STORE_NOT_CONNECTED_TEXT
          return (
            <div
              key={row.key}
              data-row={row.key}
              data-warning={row.warning ? "" : undefined}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-muted-foreground truncate">{row.label}</dt>
              <dd
                className={cn(
                  "flex-none tabular-nums",
                  row.warning
                    ? "text-warning-text inline-flex items-center gap-1 self-center font-medium"
                    : off
                      ? "text-muted-foreground"
                      : "text-foreground font-medium"
                )}
              >
                {row.warning && <AlertTriangleIcon role="img" aria-label={row.warning} className="size-3.5 flex-none" />}
                {row.value}
              </dd>
            </div>
          )
        })}
      </dl>
      <p
        data-testid="subscriber-breakdown-note"
        className={cn("mt-1 min-h-[1lh]", view.rows.some((r) => r.warning) ? "text-warning-text" : "text-muted-foreground")}
      >
        {view.note}
      </p>
    </div>
  )
}
