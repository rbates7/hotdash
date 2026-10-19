import { ChartColumnIcon } from "lucide-react"

import { formatWindowSpan, windowsEnding, type IsoDay } from "@/lib/clock"
import { compactDollars, sparklinePoints } from "@/lib/home"
import { Door } from "@/components/home/door"
import { ConnectingBadge, NotConnectedBadge } from "@/components/home/not-connected"

const W = 240
const H = 56

const CAPTION = {
  live: "From Stripe — the same MRR card as /metrics.",
  loading: "The same MRR card as /metrics.",
  not_connected: "MRR comes from Stripe once it is connected.",
  connecting: "MRR comes from Stripe; its first sync is in progress.",
} as const

/**
 * Preview of the Metrics page: the MRR card's own series of six 28-day
 * windows, so the door and the page can never show different numbers —
 * Stripe's when connected; Not connected (no series) when it has no key.
 */
export function MetricsDoor({
  trend,
  today,
  state = "not_connected",
  updated = null,
}: {
  trend: number[]
  today: IsoDay
  state?: "live" | "loading" | "connecting" | "not_connected"
  /** "Last updated …" when Stripe's figures are stale. */
  updated?: string | null
}) {
  const first = trend[0]
  const last = trend[trend.length - 1]
  const points = sparklinePoints(trend, W, H)
  const hasTrend = trend.length > 1 && state === "live"
  const span = formatWindowSpan(windowsEnding(today, trend.length))

  return (
    <Door name="Metrics" href="/metrics" icon={ChartColumnIcon} caption={CAPTION[state]}>
      <div className="flex flex-1 flex-col" data-source={state} aria-busy={state === "loading" || state === "connecting" || undefined}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            {state === "not_connected" || state === "connecting" ? "MRR" : `MRR · ${trend.length} × 28 days`}
          </span>
          {state === "not_connected" && <NotConnectedBadge />}
          {state === "connecting" && <ConnectingBadge />}
        </div>
        {updated && <span className="text-caption text-muted-foreground mt-1.5 tracking-tight">{updated}</span>}
        {hasTrend && (
          <span className="text-caption text-muted-foreground mt-1.5 tracking-tight tabular-nums">
            {compactDollars(first)} → {compactDollars(last)} · {span}
          </span>
        )}
        {hasTrend ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`MRR over ${trend.length} 28-day windows, ${span}, ${compactDollars(first)} to ${compactDollars(last)}`}
            className="mt-3 h-14 w-full"
          >
            <polyline
              points={`2,${H} ${points} ${W - 2},${H}`}
              fill="currentColor"
              className="text-brand/10"
              stroke="none"
            />
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-brand"
            />
          </svg>
        ) : (
          <p className="text-caption text-muted-foreground mt-3">
            {state === "loading"
              ? "Loading…"
              : state === "connecting"
                ? "First sync in progress; MRR appears when it finishes."
                : state === "not_connected"
                  ? "No figures until Stripe is connected."
                  : "No readings yet."}
          </p>
        )}
      </div>
    </Door>
  )
}
