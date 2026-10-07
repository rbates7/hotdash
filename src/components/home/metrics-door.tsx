import { ChartColumnIcon } from "lucide-react"

import { compactDollars, sparklinePoints } from "@/lib/home"
import { Door } from "@/components/home/door"

const W = 240
const H = 56

/**
 * Preview of the Metrics page: one small MRR trend. The page itself is a
 * later phase; this is only the door.
 */
export function MetricsDoor({ trend }: { trend: number[] }) {
  const first = trend[0]
  const last = trend[trend.length - 1]
  const points = sparklinePoints(trend, W, H)
  const hasTrend = trend.length > 1

  return (
    <Door
      name="Metrics"
      href="/metrics"
      icon={ChartColumnIcon}
      caption="Dummy series. The full page lands with the Metrics phase."
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            MRR · last {trend.length} weeks
          </span>
          {hasTrend && (
            <span className="text-caption text-muted-foreground tracking-tight tabular-nums">
              {compactDollars(first)} → {compactDollars(last)}
            </span>
          )}
        </div>
        {hasTrend ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`MRR over ${trend.length} weeks, ${compactDollars(first)} to ${compactDollars(last)}`}
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
