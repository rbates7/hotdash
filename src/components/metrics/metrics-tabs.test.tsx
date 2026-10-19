import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import {
  MetricsProvider,
  initialState,
  reducer,
  saveState,
} from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { MOCK_DAY } from "@/lib/kpis"
import { NO_EXPENSES_TEXT, NO_PRIOR_EXPENSES_TEXT } from "@/lib/live-metrics"

/** The day the mock was drawn, so rows and labels match it verbatim. */
const TODAY = MOCK_DAY
const nativeMatchMedia = window.matchMedia

function mockDesktop() {
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
}

beforeAll(() => {
  // Recharts' ResponsiveContainer measures itself; jsdom has no layout or
  // ResizeObserver, so give it an inert one. Chart internals are not under
  // test here — only that the card around them behaves.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

function renderTabs(search = "", today = TODAY) {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
  return render(
    <MetricsProvider nowMs={Date.parse(`${today}T18:00:00.000Z`)}>
      <MetricsTabs />
    </MetricsProvider>
  )
}

const card = (name: string) =>
  screen.getByRole("article", { name: new RegExp(`^${name}\\b`) })
const grid = () => screen.getByRole("region", { name: "Metric cards" })
const cards = () => within(grid()).getAllByRole("article")

describe("MetricsTabs", () => {
  beforeEach(() => {
    mockDesktop()
    navigation.params = new URLSearchParams()
  })
  afterEach(() => {
    window.matchMedia = nativeMatchMedia
  })

  it("renders the locked tab set with Overview first", () => {
    renderTabs()
    const tablist = screen.getByRole("tablist", { name: "Metrics views" })
    expect(within(tablist).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Overview",
      "New Subscribers",
      "Churned Subscribers",
      "Expenses",
    ])
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
  })

  it("pushes the chosen tab into the URL and drops it for Overview", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("tab", { name: "Expenses" }))
    expect(navigation.push).toHaveBeenCalledWith("?tab=expenses", { scroll: false })

    renderTabs("tab=expenses")
    await user.click(screen.getAllByRole("tab", { name: "Overview" }).at(-1)!)
    expect(navigation.push).toHaveBeenLastCalledWith("?", { scroll: false })
  })

  describe("hydration", () => {
    it("shows skeletons, never the seed, until localStorage has been read", async () => {
      saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove-metric", id: "arr" }))

      // Watch the DOM from before mount. The layout effect swaps the first
      // committed frame for the saved board synchronously, so by the time the
      // observer fires only its *removed* nodes still describe that frame:
      // they must be the skeleton, and no removed node may ever have been a
      // seed card.
      const removed: Element[] = []
      const observer = new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if (n instanceof Element) removed.push(n)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      navigation.params = new URLSearchParams()
      render(
        <MetricsProvider nowMs={Date.parse(`${TODAY}T18:00:00.000Z`)}>
          <MetricsTabs />
        </MetricsProvider>
      )
      await Promise.resolve()
      observer.disconnect()

      const wasSkeleton = (el: Element) =>
        el.matches('[aria-label="Loading saved metrics"]') ||
        el.querySelector('[aria-label="Loading saved metrics"]') !== null
      expect(removed.some(wasSkeleton)).toBe(true)
      for (const el of removed) {
        expect(el.matches("[data-metric]") || el.querySelector("[data-metric]")).toBeFalsy()
        expect(el.textContent).not.toContain("$26,190")
      }

      // And the committed result is the saved board, not the seed.
      expect(screen.queryByRole("status", { name: "Loading saved metrics" })).not.toBeInTheDocument()
      expect(screen.queryByRole("article", { name: /^ARR\b/ })).not.toBeInTheDocument()
      expect(cards()).toHaveLength(7)
    })
  })

  describe("sample data labelling", () => {
    it("every metric card carries a visible Sample data tag", () => {
      renderTabs()
      for (const c of cards()) {
        expect(within(c).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
      }
      expect(cards()).toHaveLength(8)
    })

    it("an added extra carries it too", async () => {
      const user = userEvent.setup()
      renderTabs()
      await user.click(screen.getByRole("button", { name: "Add metric" }))
      await user.click(await screen.findByRole("button", { name: /^NPS/ }))
      expect(within(card("NPS")).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    })

    it.each([
      ["tab=new", "New subscribers"],
      ["tab=churned", "Churned subscribers"],
      ["tab=expenses", "Expenses"],
    ])("the %s table is labelled as sample data", (search, tableName) => {
      renderTabs(search)
      const table = screen.getByRole("table", { name: tableName })
      const strip = table.closest("[class*='rounded-xl']")!.querySelector("[data-testid=sample-data-tag]")
      expect(strip).toHaveTextContent(SAMPLE_DATA_LABEL)
    })

    it("the Expenses tab card has no Sample label and leaves the seed rows out", () => {
      renderTabs("tab=expenses")
      const exp = card("Expenses")
      expect(within(exp).queryByTestId("sample-data-tag")).toBeNull()
      expect(exp).toHaveAttribute("aria-label", "Expenses no expenses entered")
      expect(within(exp).getByTestId("metric-value")).toHaveTextContent("—")
      expect(within(exp).getByTestId("metric-entries-note")).toHaveTextContent(NO_EXPENSES_TEXT)
    })
  })

  describe("clock-derived content", () => {
    it("charts name their six 28-day windows ending today, with values", () => {
      renderTabs()
      expect(
        within(card("MRR")).getByRole("img", {
          name: /^MRR, bar chart of six 28-day windows, 7 Mar – 21 Aug 2026: to 3 Apr \$23,800, .*to 21 Aug \$26,190$/,
        })
      ).toHaveAttribute("data-windows", "2026-04-03 2026-05-01 2026-05-29 2026-06-26 2026-07-24 2026-08-21")

      renderTabs("", "2026-10-07")
      expect(
        within(screen.getAllByRole("article", { name: /^MRR\b/ }).at(-1)!).getByRole("img", {
          name: /^MRR, bar chart of six 28-day windows, 23 Apr – 7 Oct 2026/,
        })
      ).toBeInTheDocument()
    })

    it("seed tables and the add-expense default follow today", async () => {
      const user = userEvent.setup()
      renderTabs("tab=new", "2026-10-07")
      const rows = within(screen.getByRole("table", { name: "New subscribers" })).getAllByRole("row").slice(1)
      expect(within(rows[0]).getByText("4 Oct 2026")).toBeInTheDocument() // today − 3
      expect(within(rows[7]).getByText("10 Sep 2026")).toBeInTheDocument() // today − 27, inside the period

      renderTabs("tab=expenses", "2026-10-07")
      const table = screen.getAllByRole("table", { name: "Expenses" }).at(-1)!
      expect(within(table).getByRole("row", { name: /Stripe fees/ })).toHaveTextContent("7 Oct 2026")
      await user.click(screen.getAllByRole("button", { name: "Add expense" }).at(-1)!)
      const dialog = await screen.findByRole("dialog", { name: "Add expense" })
      expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-07")
      expect(within(dialog).getByLabelText("Date")).toHaveAttribute("max", "2026-10-07")
    })
  })

  describe("period-scoped expenses", () => {
    it("the add-expense date is bounded to the current period and the submit respects it", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Add expense" }))
      const dialog = await screen.findByRole("dialog", { name: "Add expense" })
      const date = within(dialog).getByLabelText("Date")
      expect(date).toHaveAttribute("min", "2026-07-25")
      expect(date).toHaveAttribute("max", "2026-08-21")
      expect(within(dialog).getByText(/25 Jul – 21 Aug 2026/)).toBeInTheDocument()

      await user.type(within(dialog).getByRole("textbox", { name: "Category" }), "Old thing")
      await user.type(within(dialog).getByRole("spinbutton", { name: "Amount" }), "50")
      const submit = within(dialog).getByRole("button", { name: "Add expense" })
      expect(submit).toBeEnabled()
      await user.clear(date)
      await user.type(date, "2026-07-24")
      expect(submit).toBeDisabled()
      await user.clear(date)
      await user.type(date, "2026-07-25")
      expect(submit).toBeEnabled()
    })

    it("amounts under $1 are rejected by the form", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Add expense" }))
      const dialog = await screen.findByRole("dialog", { name: "Add expense" })
      await user.type(within(dialog).getByRole("textbox", { name: "Category" }), "Pennies")
      await user.type(within(dialog).getByRole("spinbutton", { name: "Amount" }), "0")
      expect(within(dialog).getByRole("button", { name: "Add expense" })).toBeDisabled()
    })

    it("a persisted row outside the period stays in the table but not in the card", () => {
      saveState(window.localStorage, {
        ...initialState(TODAY),
        expenses: [
          ...initialState(TODAY).expenses,
          { id: "exp-9", category: "Old", amount: 1_000, date: "2026-07-01", recurring: false },
        ],
        nextExpenseId: 10,
      })
      renderTabs("tab=expenses")
      const table = screen.getByRole("table", { name: "Expenses" })
      expect(within(table).getByRole("row", { name: /Old/ })).toBeInTheDocument()
      // Only the founder's row counts, and it is in the window before.
      expect(within(card("Expenses")).getByTestId("metric-value")).toHaveTextContent("$0")
      expect(within(card("Expenses")).getByTestId("trend")).toHaveTextContent("−100.0%")
    })
  })

  describe("Overview", () => {
    it("shows the eight default cards, in order, with value, trend and caption", () => {
      renderTabs()
      const names = cards().map((a) => a.getAttribute("aria-label"))
      expect(names).toEqual([
        "MRR $26,190 +4.2%",
        "ARR $314,280 +4.2%",
        "Churn Rate 2.7% −1.5 pts",
        "Revenue $28,410 +6.1%",
        "Retention 97.3% +1.5 pts",
        "Subscribers 186 +3",
        "Trial Conversions 28% +3.1 pts",
        "Expenses no expenses entered",
      ])
      const mrr = card("MRR")
      expect(within(mrr).getByTestId("metric-value")).toHaveTextContent("$26,190")
      expect(within(mrr).getByTestId("trend")).toHaveTextContent("+4.2%")
      expect(within(mrr).getByTestId("trend")).toHaveAttribute("data-good", "true")
      expect(within(mrr).getByText("vs previous 28 days")).toBeInTheDocument()

      const exp = card("Expenses")
      expect(within(exp).queryByTestId("trend")).toBeNull()
      expect(within(exp).queryByTestId("sample-data-tag")).toBeNull()
    })

    it("each card has a bar/line toggle reflecting its default", () => {
      renderTabs()
      expect(within(card("MRR")).getByRole("button", { name: "MRR: bar chart" })).toHaveAttribute("aria-pressed", "true")
      expect(within(card("MRR")).getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "false")
      expect(within(card("Churn Rate")).getByRole("button", { name: "Churn Rate: line chart" })).toHaveAttribute("aria-pressed", "true")
    })

    it("toggles a card between bar and line", async () => {
      const user = userEvent.setup()
      renderTabs()
      await user.click(within(card("MRR")).getByRole("button", { name: "MRR: line chart" }))
      expect(within(card("MRR")).getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
      expect(within(card("MRR")).getByRole("button", { name: "MRR: bar chart" })).toHaveAttribute("aria-pressed", "false")
      expect(within(card("MRR")).getByRole("img", { name: /^MRR, line chart of six 28-day windows, 7 Mar – 21 Aug 2026/ })).toBeInTheDocument()
    })

    it("removes a card and offers it again in the picker after the extras", async () => {
      const user = userEvent.setup()
      renderTabs()
      await user.click(within(card("Revenue")).getByRole("button", { name: "Remove Revenue" }))
      expect(screen.queryByRole("article", { name: "Revenue" })).not.toBeInTheDocument()
      expect(cards()).toHaveLength(7)

      await user.click(screen.getByRole("button", { name: "Add metric" }))
      const picker = await screen.findByRole("dialog", { name: "Add a metric" })
      const items = within(picker).getAllByRole("button").map((b) => b.textContent)
      expect(items).toEqual([
        "Active Users731",
        "CAC$142",
        "LTV$1,680",
        "ARPU$141",
        "NRR108%",
        "Runway14 mo",
        "NPS52",
        "Valuation$1.10M",
        "Revenue$28,410",
      ])
    })

    it("the picker is itself labelled as sample data", async () => {
      const user = userEvent.setup()
      renderTabs()
      await user.click(screen.getByRole("button", { name: "Add metric" }))
      const picker = await screen.findByRole("dialog", { name: "Add a metric" })
      expect(within(picker).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    })

    it("adds an extra metric from the picker and closes it", async () => {
      const user = userEvent.setup()
      renderTabs()
      await user.click(screen.getByRole("button", { name: "Add metric" }))
      await user.click(await screen.findByRole("button", { name: /^Valuation/ }))
      const valuation = card("Valuation")
      expect(within(valuation).getByTestId("metric-value")).toHaveTextContent("$1.10M")
      expect(within(valuation).getByText("ARR × 3.5 · illustrative only")).toBeInTheDocument()
      expect(cards()).toHaveLength(9)
      expect(screen.queryByRole("dialog", { name: "Add a metric" })).not.toBeInTheDocument()
    })

    it("shows an empty state when every card is removed and the picker lists all sixteen", async () => {
      const user = userEvent.setup()
      renderTabs()
      for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
        await user.click(within(card(name)).getByRole("button", { name: `Remove ${name}` }))
      }
      expect(screen.queryByRole("region", { name: "Metric cards" })).not.toBeInTheDocument()
      expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("No metrics on the board")

      await user.click(screen.getByRole("button", { name: "Add metric" }))
      const picker = await screen.findByRole("dialog", { name: "Add a metric" })
      expect(within(picker).getAllByRole("button")).toHaveLength(16)
    })

    it("tells you when everything is already on the board", { timeout: 20_000 }, async () => {
      const user = userEvent.setup()
      renderTabs()
      for (let i = 0; i < 8; i++) {
        await user.click(screen.getByRole("button", { name: "Add metric" }))
        const picker = await screen.findByRole("dialog", { name: "Add a metric" })
        await user.click(within(picker).getAllByRole("button")[0])
      }
      expect(cards()).toHaveLength(16)
      await user.click(screen.getByRole("button", { name: "Add metric" }))
      expect(await screen.findByText("All metrics are on the board")).toBeInTheDocument()
    })
  })

  describe("subscriber tables", () => {
    it("New Subscribers lists the eight rows, newest first, with plan pills", () => {
      renderTabs("tab=new")
      const table = screen.getByRole("table", { name: "New subscribers" })
      expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Name / Email",
        "Plan",
        "Signup Date",
      ])
      const rows = within(table).getAllByRole("row").slice(1)
      expect(rows).toHaveLength(8)
      expect(within(rows[0]).getByText("Alisha Patel")).toBeInTheDocument()
      expect(within(rows[0]).getByText("apatel@canyonridgesports.com")).toBeInTheDocument()
      expect(within(rows[0]).getByText("Monthly")).toBeInTheDocument()
      expect(within(rows[0]).getByText("18 Aug 2026")).toBeInTheDocument()
      expect(within(rows[7]).getByText("Troy Nguyen")).toBeInTheDocument()
    })

    it("sorts New Subscribers by a column when its header is clicked", async () => {
      const user = userEvent.setup()
      renderTabs("tab=new")
      await user.click(screen.getByRole("button", { name: "Name / Email" }))
      const table = screen.getByRole("table", { name: "New subscribers" })
      expect(within(table).getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending")
      const first = within(table).getAllByRole("row")[1]
      expect(within(first).getByText("Alisha Patel")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Name / Email" }))
      expect(within(within(table).getAllByRole("row")[1]).getByText("Troy Nguyen")).toBeInTheDocument()
    })

    it("Churned Subscribers lists the five rows with lifetime value", () => {
      renderTabs("tab=churned")
      const table = screen.getByRole("table", { name: "Churned subscribers" })
      expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Name / Email",
        "Signup Date",
        "Churn Date",
        "Lifetime Value",
      ])
      const rows = within(table).getAllByRole("row").slice(1)
      expect(rows).toHaveLength(5)
      expect(within(rows[0]).getByText("Brett Holloway")).toBeInTheDocument()
      expect(within(rows[0]).getByText("12 Jan 2026")).toBeInTheDocument()
      expect(within(rows[0]).getByText("8 Aug 2026")).toBeInTheDocument()
      expect(within(rows[0]).getByText("$199")).toBeInTheDocument()
    })
  })

  describe("Expenses", () => {
    it("shows the Expenses card without a remove button, plus the eight rows", () => {
      renderTabs("tab=expenses")
      const exp = card("Expenses")
      expect(within(exp).getByTestId("metric-value")).toHaveTextContent("—")
      expect(within(exp).queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument()

      const table = screen.getByRole("table", { name: "Expenses" })
      expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Category",
        "Amount",
        "Date",
        "Recurring",
        "Actions",
      ])
      const rows = within(table).getAllByRole("row").slice(1)
      expect(rows).toHaveLength(8)
      expect(within(rows[0]).getByText("AWS")).toBeInTheDocument()
      expect(within(rows[0]).getByText("$5,410")).toBeInTheDocument()
      expect(within(rows[0]).getByText("Yes")).toBeInTheDocument()
      expect(within(rows[1]).getByText("Stripe fees")).toBeInTheDocument()
      expect(within(rows[1]).getByText("No")).toBeInTheDocument()
    })

    it("adds an expense through the dialog and the card total follows", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Add expense" }))
      const dialog = await screen.findByRole("dialog", { name: "Add expense" })
      const submit = within(dialog).getByRole("button", { name: "Add expense" })
      expect(submit).toBeDisabled()

      await user.type(within(dialog).getByRole("textbox", { name: "Category" }), "Vercel")
      await user.type(within(dialog).getByRole("spinbutton", { name: "Amount" }), "160")
      expect(submit).toBeEnabled()
      await user.click(within(dialog).getByRole("switch", { name: "Recurring" }))
      await user.click(submit)

      expect(screen.queryByRole("dialog", { name: "Add expense" })).not.toBeInTheDocument()
      const table = screen.getByRole("table", { name: "Expenses" })
      const vercel = within(table).getByText("Vercel").closest("tr")!
      expect(within(vercel).getByText("$160")).toBeInTheDocument()
      expect(within(vercel).getByText("21 Aug 2026")).toBeInTheDocument()
      expect(within(vercel).getByText("Yes")).toBeInTheDocument()
      expect(within(table).getAllByRole("row").slice(1)).toHaveLength(9)
      // The card counts the founder's row only: $160, nothing in the window before.
      expect(within(card("Expenses")).getByTestId("metric-value")).toHaveTextContent("$160")
      expect(within(card("Expenses")).queryByTestId("trend")).toBeNull()
      expect(within(card("Expenses")).getByTestId("metric-entries-note")).toHaveTextContent(NO_PRIOR_EXPENSES_TEXT)
    })

    it("removes an expense; a seed row never counted, so the card stays empty", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Remove AWS" }))
      const table = screen.getByRole("table", { name: "Expenses" })
      expect(within(table).queryByText("AWS")).not.toBeInTheDocument()
      expect(within(card("Expenses")).getByTestId("metric-value")).toHaveTextContent("—")
      expect(within(card("Expenses")).getByTestId("metric-entries-note")).toHaveTextContent(NO_EXPENSES_TEXT)
    })

    it("the Expenses card shares its chart choice with the Overview card", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Expenses: line chart" }))
      await user.click(screen.getByRole("tab", { name: "Overview" }))
      // Tab state is URL-driven in the app; here the mocked router does not
      // re-render, so re-mount at the Overview with the same store contents.
      expect(navigation.push).toHaveBeenCalledWith("?", { scroll: false })
      renderTabs()
      expect(
        within(screen.getAllByRole("article", { name: /^Expenses\b/ }).at(-1)!).getByRole("button", {
          name: "Expenses: line chart",
        })
      ).toHaveAttribute("aria-pressed", "true")
    })
  })
})
