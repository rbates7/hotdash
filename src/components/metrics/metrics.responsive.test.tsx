import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { MetricsPersistenceNote } from "@/components/metrics/metrics-persistence-note"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { METRICS_PRESSED, METRICS_RESET } from "@/components/metrics/responsive"
import {
  PHONE_MAX_WIDTH,
  PHONE_QUERY,
  TABLET_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  TABLET_PORTRAIT_MAX_WIDTH,
  TABLET_PORTRAIT_QUERY,
  TABLET_QUERY,
} from "@/hooks/use-mobile"
import { MOCK_DAY } from "@/lib/kpis"

const TODAY = MOCK_DAY
const nativeMatchMedia = window.matchMedia

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

beforeEach(() => {
  // Desktop unless a suite overrides with mockViewport.
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

function mockViewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query === PHONE_QUERY
        ? width <= PHONE_MAX_WIDTH
        : query === TABLET_PORTRAIT_QUERY
          ? width >= TABLET_MIN_WIDTH && width <= TABLET_PORTRAIT_MAX_WIDTH
          : query === TABLET_QUERY
            ? width >= TABLET_MIN_WIDTH && width <= TABLET_MAX_WIDTH
            : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function renderTabs(search = "", today = TODAY) {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
  return render(
    <MetricsProvider nowMs={Date.parse(`${today}T18:00:00.000Z`)}>
      <MetricsTabs />
    </MetricsProvider>
  )
}

const card = (name: string) => screen.getByRole("article", { name: new RegExp(`^${name}\\b`) })
const grid = () => screen.getByRole("region", { name: "Metric cards" })

describe("phone (<768): subscriber cards and Expenses pin", () => {
  beforeEach(() => mockViewport(390))

  it("maps New Subscribers Name / Plan / Email / Signup date", () => {
    renderTabs("tab=new")
    const list = screen.getByRole("list")
    const cards = within(list).getAllByRole("listitem")
    expect(cards).toHaveLength(8)
    expect(cards.map((c) => c.querySelector(`[data-slot='${ROW_COLLAPSE_SLOT}']`))).not.toContain(null)

    const alisha = within(list).getByText("Alisha Patel").closest("[data-slot='row-collapse']") as HTMLElement
    expect(alisha).toHaveTextContent("Monthly")
    expect(alisha).toHaveTextContent("apatel@canyonridgesports.com")
    expect(alisha).toHaveTextContent("18 Aug 2026")
    expect(within(alisha).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(within(alisha).getByText("Email:")).toHaveClass("sr-only")
    expect(within(alisha).getByText("Signup date:")).toHaveClass("sr-only")
  })

  it("maps Churned Subscribers Name / lifetime / Email / signup → churn", () => {
    renderTabs("tab=churned")
    const list = screen.getByRole("list")
    const brett = within(list).getByText("Brett Holloway").closest("[data-slot='row-collapse']")!
    expect(brett).toHaveTextContent("$199")
    expect(brett).toHaveTextContent("b.holloway@meadowpark.edu")
    expect(brett).toHaveTextContent("12 Jan 2026 → 8 Aug 2026")
  })

  it("keeps the Expenses table with a phone-only pin class, not the shared pinFirst paint", () => {
    renderTabs("tab=expenses")
    const scroller = screen.getByRole("table", { name: "Expenses" }).closest("[data-slot='responsive-table']")!
    expect(scroller).not.toHaveAttribute("data-pin-first")
    expect(scroller.className).toContain("max-md:[&_th:first-child]:sticky")
    expect(scroller.className).toContain("xl:overflow-visible!")
    expect(screen.getByTestId("metrics-expenses-fade")).toBeInTheDocument()
  })

  it("opens Add metric as a bottom sheet with the stock ×", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("button", { name: "Add metric" }))
    const sheet = await screen.findByRole("dialog", { name: "Add a metric" })
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: /^CAC/ })).toBeInTheDocument()
    await user.click(within(sheet).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Add a metric" })).not.toBeInTheDocument()
  })

  it("opens Add expense as a bottom sheet with the stock ×", async () => {
    const user = userEvent.setup()
    renderTabs("tab=expenses")
    await user.click(screen.getByRole("button", { name: "Add expense" }))
    const sheet = await screen.findByRole("dialog", { name: "Add expense" })
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument()
    expect(within(sheet).getByLabelText("Category")).toBeInTheDocument()
    await user.click(within(sheet).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Add expense" })).not.toBeInTheDocument()
  })
})

describe("tablet (768–1279): Add metric is a sheet, tables stay tables", () => {
  beforeEach(() => mockViewport(820))

  it("opens Add metric as a sheet with the stock ×", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("button", { name: "Add metric" }))
    const sheet = await screen.findByRole("dialog", { name: "Add a metric" })
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument()
    await user.click(within(sheet).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Add a metric" })).not.toBeInTheDocument()
  })

  it("keeps New Subscribers as a table, not stacked cards", () => {
    renderTabs("tab=new")
    expect(screen.getByRole("table", { name: "New subscribers" })).toBeInTheDocument()
    expect(screen.getByRole("list")).toHaveClass("md:hidden")
  })
})

describe("accessible names and pressed toggles", () => {
  it("each card's name carries label, value and trend once", () => {
    renderTabs()
    const mrr = card("MRR")
    expect(mrr).toHaveAccessibleName("MRR $26,190 +4.2%")
    expect(within(grid()).getByRole("article", { name: "ARR $314,280 +4.2%" })).toBeInTheDocument()
  })

  it("pressed is solid primary at every width", () => {
    expect(METRICS_PRESSED).toContain("aria-pressed:bg-primary!")
    expect(METRICS_PRESSED).not.toContain("max-xl:")
    renderTabs()
    const bar = within(card("MRR")).getByRole("button", { name: "MRR: bar chart" })
    expect(bar).toHaveAttribute("aria-pressed", "true")
    expect(bar.className).toContain("aria-pressed:bg-primary!")
  })

  it("passes the 44px-below-1280 Reset through the shared resetClassName", () => {
    render(
      <MetricsProvider nowMs={Date.parse(`${TODAY}T18:00:00.000Z`)}>
        <MetricsPersistenceNote />
      </MetricsProvider>
    )
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset.className).toContain(METRICS_RESET)
  })
})
