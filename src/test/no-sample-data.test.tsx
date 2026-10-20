import fs from "node:fs"
import path from "node:path"

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import { todayIn } from "@/lib/clock"
import { formatMetricValue, type MetricId } from "@/lib/metrics"
import * as kpis from "@/lib/kpis"
import { METRIC_DEFS, growthStrip, snapshotFor, truthStrip } from "@/lib/kpis-fixture"
import { kpiSets } from "@/lib/home-kpis"
import { sampleBase } from "@/lib/subscriber-source-fixture"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"
import { SubscriberTicker } from "@/components/home/subscriber-ticker"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { StatusScreen } from "@/components/system-status/status-screen"

/**
 * Rashad's Oct 16 rule, end to end in jsdom: with no source set (the test
 * default: Stripe, PostHog, Gmail all not connected), no screen renders an
 * invented figure. Each check renders the screen and looks for the old
 * fixture numbers, which now exist only in the *-fixture test modules.
 */

const today = todayIn(FIXED_NOW)
/** All text, with whitespace removed, so split digit tiles still match. */
const flat = () => (document.body.textContent ?? "").replace(/\s+/g, "")
const sampleFigures = (values: string[]) => [...new Set(values.filter((v) => /\d/.test(v)))]

describe("no sample data with no source set", () => {
  const nativeMatchMedia = window.matchMedia
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })
  afterEach(() => {
    window.matchMedia = nativeMatchMedia
  })

  it("Home KPI strip: Not connected, none of the old truth or growth figures", () => {
    render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <HomeScreen />
      </IssuesProvider>
    )
    const strip = screen.getByRole("region", { name: "KPI strip" })
    expect(strip).toHaveTextContent("Not connected")
    const text = (strip.textContent ?? "").replace(/\s+/g, "")
    const invented = sampleFigures([...truthStrip({ today }), ...growthStrip({ today })].flatMap((k) => [k.value, k.delta]))
    expect(invented.length).toBeGreaterThan(0)
    for (const figure of invented) expect(text).not.toContain(figure.replace(/\s+/g, ""))
    // The shipped card list has labels only.
    for (const k of Object.values(kpiSets()).flat()) expect(k.value).not.toMatch(/\d/)
  })

  it("Home ticker: Not connected, never the simulated count", () => {
    render(<SubscriberTicker variant="header" />)
    expect(screen.getAllByText(/Not connected/).length).toBeGreaterThan(0)
    const base = sampleBase(FIXED_NOW)
    expect(flat()).not.toContain(String(base))
    expect(flat()).not.toContain(base.toLocaleString("en-US"))
  })

  it("Metrics: Subscribers, Churn and every other card show no fixture figure", () => {
    navigation.params = new URLSearchParams("")
    render(
      <MetricsProvider nowMs={Date.parse(`${today}T18:00:00.000Z`)}>
        <MetricsTabs />
      </MetricsProvider>
    )
    const ids = Object.keys(METRIC_DEFS) as MetricId[]
    const invented = sampleFigures(
      ids.flatMap((id) => {
        const s = snapshotFor(id, { today })
        return [formatMetricValue(s.value, s.unit), formatMetricValue(s.previous, s.unit)]
      })
    )
    const text = flat()
    for (const id of ["subscribers", "churn"] as const) {
      const s = snapshotFor(id, { today })
      expect(text).not.toContain(formatMetricValue(s.value, s.unit).replace(/\s+/g, ""))
    }
    for (const figure of invented) expect(text).not.toContain(figure.replace(/\s+/g, ""))
  })

  it("System Status: no sample tag, notice, rows or incident", () => {
    render(<StatusScreen nowMs={FIXED_NOW_MS} />)
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByTestId("sample-data-notice")).toBeNull()
    expect(screen.queryByRole("listitem")).toBeNull()
    expect(screen.queryByRole("region", { name: "Past incident" })).toBeNull()
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0)
  })
})

describe("the shipped modules carry no sample figures", () => {
  it("@/lib/kpis exports definitions only", () => {
    const names = Object.keys(kpis)
    for (const gone of ["snapshotFor", "truthStrip", "growthStrip", "mrrTrend", "dailyRevenue", "cashIn", "seedExpenses", "MOCK_DAY"]) {
      expect(names).not.toContain(gone)
    }
    expect(names.filter((n) => n.startsWith("SAMPLE_"))).toEqual([])
    for (const id of Object.keys(kpis.METRIC_DEFS) as MetricId[]) {
      expect(kpis.metricShell(id)).toMatchObject({ value: 0, previous: 0, series: [] })
    }
  })

  it("no app module imports a test-only fixture", () => {
    const root = path.resolve(__dirname, "..")
    const fixtures = /from\s+["']@\/lib\/(kpis-fixture|subscriber-source-fixture|system-status-fixture|home-fixture)["']/
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== "test") walk(full)
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !/-fixture\.ts$/.test(entry.name)) {
          if (fixtures.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(root, full))
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
    expect(fs.existsSync(path.join(root, "lib/home-fixture.ts"))).toBe(false)
  })
})
