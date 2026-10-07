import { ChartColumnIcon } from "lucide-react"

import { formatMonthSpan, monthsEnding, type IsoDay } from "@/lib/clock"
import { compactDollars, sparklinePoints } from "@/lib/home"
import { Door } from "@/components/home/door"
import { SampleDataTag } from "@/components/sample-data"

const W = 240
const H = 56

/**
 * Preview of the Metrics page: the MRR card's own six-month series, so the
 * door and the page can never show different numbers.
 */
export function MetricsDoor({ trend, today }: { trend: number[]; today: IsoDay }) {
  const first = trend[0]
  const last = trend[trend.length - 1]
  const points = sparklinePoints(trend, W, H)
  const hasTrend = trend.length > 1
  const span = formatMonthSpan(monthsEnding(today, trend.length))

  return (
    <Door
      name="Metrics"
      href="/metrics"
      icon={ChartColumnIcon}
      caption="Sample series — the same MRR card as /metrics."
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            MRR · last {trend.length} months
          </span>
          <SampleDataTag />
        </div>
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
            aria-label={`MRR over ${trend.length} months, ${span}, ${compactDollars(first)} to ${compactDollars(last)}`}
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
          <p className="text-caption text-muted-foreground mt-3">No readings yet.</p>
        )}
      </div>
    </Door>
  )
}
