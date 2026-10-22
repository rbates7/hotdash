"use client"

import * as React from "react"
import { Bar, BarChart, Cell, Line, LineChart, YAxis } from "recharts"
import type { BarShapeProps } from "recharts/types/cartesian/Bar"

import { formatDayShort, formatWindowSpan, windowsEnding, type IsoDay } from "@/lib/clock"
import { formatMetricValue, type ChartType, type MetricUnit } from "@/lib/metrics"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const WIDTH = 320
const HEIGHT = 88

/**
 * The current 28-day window reads in ink; the five before it in a quiet
 * grey that steps with the theme (the mock's `--chart-dot`).
 */
const CHART_CONFIG = {
  current: { label: "This 28-day window", color: "var(--foreground)" },
  past: { label: "Previous 28-day windows", theme: { light: "#D4D4D8", dark: "#3F3F46" } },
} satisfies ChartConfig

/**
 * Pad the value range the way the mock does, so a flat-ish series still
 * reads as a trend instead of six identical columns.
 */
export function chartDomain(series: readonly (number | null)[]): [number, number] {
  const values = series.filter((v): v is number => v !== null)
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.28 || Math.abs(max) * 0.16 || 1
  return [min - pad, max + pad * 0.1]
}

/** Columns made of small stacked squares, as in the mock's sparkline. */
function DottedColumn(props: BarShapeProps) {
  const { x, y, width, height, fill } = props
  // A window with no reading (a live rate with nothing to divide by) has no column.
  if (![x, y, width, height].every(Number.isFinite)) return null
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

type MetricChartProps = {
  /** Null is a window with no reading: no column, a gap in the line. */
  series: readonly (number | null)[]
  type: ChartType
  label: string
  /** How each point is read aloud, e.g. "$26,190". */
  unit: MetricUnit
  /** The page's calendar day; the six points are the six 28-day windows ending on it. */
  today: IsoDay
  /** A daily chart instead (Trials per day): each point's YYYY-MM-DD day, oldest first. */
  days?: readonly string[]
}

/** A card's sparkline: six 28-day windows, or one point a day when `days` is given. */
export function MetricChart({ days, ...props }: MetricChartProps) {
  return days ? <DailyChart {...props} days={days} /> : <WindowChart {...props} />
}

function WindowChart({
  series,
  type,
  label,
  unit,
  today,
}: {
  /** Null is a window with no reading: no column, a gap in the line. */
  series: readonly (number | null)[]
  type: ChartType
  label: string
  /** How each point is read aloud, e.g. "$26,190". */
  unit: MetricUnit
  /** The page's calendar day; the six points are the six 28-day windows ending on it. */
  today: IsoDay
}) {
  // The compact axis is intentionally tick-free, so the chart's windows
  // and values live in its accessible name: each point is a 28-day window
  // labelled by the day it ends, derived from `today`.
  const windows = React.useMemo(() => windowsEnding(today, series.length), [today, series.length])
  const data = React.useMemo(
    () => series.map((v, i) => ({ i, v, ends: windows[i] ? formatDayShort(windows[i].end) : "" })),
    [series, windows]
  )
  const domain = React.useMemo(() => chartDomain(series), [series])
  const last = data.length - 1
  const span = formatWindowSpan(windows)
  const readings = data.map((d) => `to ${d.ends} ${d.v === null ? "no data" : formatMetricValue(d.v, unit)}`)
  const name = `${label}, ${type} chart of six 28-day windows, ${span}: ${readings.join(", ")}`

  return (
    <ChartContainer
      config={CHART_CONFIG}
      initialDimension={{ width: WIDTH, height: HEIGHT }}
      className="aspect-auto h-[88px] w-full"
      role="img"
      aria-label={name}
      title={`${label}: ${span}`}
      data-windows={windows.map((w) => w.end).join(" ")}
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
          <ChartTooltip
            cursor={false}
            allowEscapeViewBox={{ x: true, y: true }}
            content={
              <ChartTooltipContent
                hideLabel
                hideIndicator
                formatter={(value, _name, item) => {
                  const point = item.payload as { ends?: string }
                  return (
                    <div className="grid min-w-28 gap-1">
                      <span className="text-muted-foreground">Ending {point.ends}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {typeof value === "number" ? formatMetricValue(value, unit) : "No data"}
                      </span>
                    </div>
                  )
                }}
              />
            }
          />
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
          <ChartTooltip
            cursor={false}
            allowEscapeViewBox={{ x: true, y: true }}
            content={
              <ChartTooltipContent
                hideLabel
                hideIndicator
                formatter={(value, _name, item) => {
                  const point = item.payload as { ends?: string }
                  return (
                    <div className="grid min-w-28 gap-1">
                      <span className="text-muted-foreground">Ending {point.ends}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {typeof value === "number" ? formatMetricValue(value, unit) : "No data"}
                      </span>
                    </div>
                  )
                }}
              />
            }
          />
          <Line
            dataKey="v"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={1.75}
            strokeLinecap="round"
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === last && Number.isFinite(props.cy) ? (
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

/** The dotted column, with nothing at all on a day with no trials (not two dots that read as some). */
function DailyColumn(props: BarShapeProps) {
  const v = (props.payload as { v?: number | null } | undefined)?.v
  return v ? <DottedColumn {...props} /> : <g />
}

/**
 * One point a day (Trials per day: the 28 days of the current window), in
 * the same compact style: today in ink, the days before in the quiet grey.
 * Its accessible name reads each day, as the window chart reads windows.
 */
function DailyChart({
  series,
  type,
  label,
  unit,
  days,
}: {
  series: readonly (number | null)[]
  type: ChartType
  label: string
  unit: MetricUnit
  days: readonly string[]
}) {
  const data = React.useMemo(
    () => series.map((v, i) => ({ i, v, day: days[i] ? formatDayShort(days[i] as IsoDay) : "" })),
    [series, days]
  )
  // Counts start at 0, so the bars are honest heights (no padded floor).
  const domain = React.useMemo<[number, number]>(() => [0, Math.max(1, ...series.filter((v): v is number => v !== null))], [series])
  const last = data.length - 1
  const span = data.length > 0 ? `${data[0].day} to ${data[last].day}` : ""
  const readings = data.map((d) => `${d.day} ${d.v === null ? "no data" : formatMetricValue(d.v, unit)}`)
  const name = `${label}, ${type} chart of ${data.length} days, ${span}: ${readings.join(", ")}`
  return (
    <ChartContainer
      config={CHART_CONFIG}
      initialDimension={{ width: WIDTH, height: HEIGHT }}
      className="aspect-auto h-[88px] w-full"
      role="img"
      aria-label={name}
      title={`${label}: ${span}`}
      data-days={days.join(" ")}
    >
      {type === "bar" ? (
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap="10%" accessibilityLayer={false}>
          <YAxis hide domain={domain} />
          <ChartTooltip
            cursor={false}
            allowEscapeViewBox={{ x: true, y: true }}
            content={
              <ChartTooltipContent
                hideLabel
                hideIndicator
                formatter={(value, _name, item) => {
                  const point = item.payload as { day?: string }
                  return (
                    <div className="grid min-w-28 gap-1">
                      <span className="text-muted-foreground">{point.day}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {typeof value === "number" ? formatMetricValue(value, unit) : "No data"}
                      </span>
                    </div>
                  )
                }}
              />
            }
          />
          <Bar dataKey="v" isAnimationActive={false} shape={DailyColumn}>
            {data.map((d) => (
              <Cell key={d.i} fill={d.i === last ? "var(--color-current)" : "var(--color-past)"} />
            ))}
          </Bar>
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} accessibilityLayer={false}>
          <YAxis hide domain={domain} />
          <ChartTooltip
            cursor={false}
            allowEscapeViewBox={{ x: true, y: true }}
            content={
              <ChartTooltipContent
                hideLabel
                hideIndicator
                formatter={(value, _name, item) => {
                  const point = item.payload as { day?: string }
                  return (
                    <div className="grid min-w-28 gap-1">
                      <span className="text-muted-foreground">{point.day}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {typeof value === "number" ? formatMetricValue(value, unit) : "No data"}
                      </span>
                    </div>
                  )
                }}
              />
            }
          />
          <Line
            dataKey="v"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={1.75}
            strokeLinecap="round"
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      )}
    </ChartContainer>
  )
}
