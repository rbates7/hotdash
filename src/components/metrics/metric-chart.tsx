"use client"

import * as React from "react"
import { Bar, BarChart, Cell, Line, LineChart, YAxis } from "recharts"
import type { BarShapeProps } from "recharts/types/cartesian/Bar"

import { formatMonthSpan, monthsEnding, type IsoDay } from "@/lib/clock"
import { formatMetricValue, type ChartType, type MetricUnit } from "@/lib/metrics"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

const WIDTH = 120
const HEIGHT = 52

/**
 * The current month reads in ink; the five before it in a quiet grey that
 * steps with the theme (the mock's `--chart-dot`).
 */
const CHART_CONFIG = {
  current: { label: "This month", color: "var(--foreground)" },
  past: { label: "Previous months", theme: { light: "#D4D4D8", dark: "#3F3F46" } },
} satisfies ChartConfig

/**
 * Pad the value range the way the mock does, so a flat-ish series still
 * reads as a trend instead of six identical columns.
 */
export function chartDomain(series: readonly number[]): [number, number] {
  const min = Math.min(...series)
  const max = Math.max(...series)
  const pad = (max - min) * 0.28 || Math.abs(max) * 0.16 || 1
  return [min - pad, max + pad * 0.1]
}

/** Columns made of small stacked squares, as in the mock's sparkline. */
function DottedColumn(props: BarShapeProps) {
  const { x, y, width, height, fill } = props
  const square = 3.4
  const gap = 1.55
  const segments = Math.max(2, Math.round(height / (square + gap)))
  const left = x + width / 2 - square / 2
  const bottom = y + height
  return (
    <g>
      {Array.from({ length: segments }, (_, s) => (
        <rect
          key={s}
          x={left}
          y={bottom - square - s * (square + gap)}
          width={square}
          height={square}
          rx={0.55}
          fill={fill}
        />
      ))}
    </g>
  )
}

export function MetricChart({
  series,
  type,
  label,
  unit,
  today,
}: {
  series: readonly number[]
  type: ChartType
  label: string
  /** How each point is read aloud, e.g. "$26,190". */
  unit: MetricUnit
  /** The page's calendar day; the six points are the six months ending in it. */
  today: IsoDay
}) {
  // The axis is 120×52px, far too small for month ticks, so the chart's
  // months and values live in its accessible name and the sr-only list
  // below instead. Months derive from `today`, so the same series reads as
  // the right half-year whenever it is viewed.
  const months = React.useMemo(() => monthsEnding(today, series.length), [today, series.length])
  const data = React.useMemo(
    () => series.map((v, i) => ({ i, v, month: months[i]?.label ?? "" })),
    [series, months]
  )
  const domain = React.useMemo(() => chartDomain(series), [series])
  const last = data.length - 1
  const span = formatMonthSpan(months)
  const readings = data.map((d) => `${d.month} ${formatMetricValue(d.v, unit)}`)
  const name = `${label}, six-month ${type} chart, ${span}: ${readings.join(", ")}`

  return (
    <ChartContainer
      config={CHART_CONFIG}
      initialDimension={{ width: WIDTH, height: HEIGHT }}
      className="aspect-auto h-[52px] w-[120px] flex-none"
      role="img"
      aria-label={name}
      title={`${label}: ${span}`}
      data-months={months.map((m) => m.label).join(" ")}
    >
      {type === "bar" ? (
        <BarChart
          data={data}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="30%"
          // The wrapper is the single role="img"; Recharts must not add a
          // focusable role="application" layer inside it.
          accessibilityLayer={false}
        >
          <YAxis hide domain={domain} />
          <Bar
            dataKey="v"
            shape={DottedColumn}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell
                key={d.i}
                fill={d.i === last ? "var(--color-current)" : "var(--color-past)"}
              />
            ))}
          </Bar>
        </BarChart>
      ) : (
        <LineChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          accessibilityLayer={false}
        >
          <YAxis hide domain={domain} />
          <Line
            dataKey="v"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={1.75}
            strokeLinecap="round"
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === last ? (
                <circle
                  key="end"
                  cx={props.cx}
                  cy={props.cy}
                  r={2.2}
                  fill="var(--color-current)"
                  stroke="none"
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={false}
          />
        </LineChart>
      )}
    </ChartContainer>
  )
}
