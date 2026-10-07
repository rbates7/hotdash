import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import {
  MetricsProvider,
  initialState,
  reducer,
  saveState,
} from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { SAMPLE_DATA_LABEL } from "@/components/metrics/sample-data"

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

function renderTabs(search = "") {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
  return render(
    <MetricsProvider>
      <MetricsTabs />
    </MetricsProvider>
  )
}

const card = (name: string) => screen.getByRole("article", { name })
const grid = () => screen.getByRole("region", { name: "Metric cards" })
const cards = () => within(grid()).getAllByRole("article")

describe("MetricsTabs", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams()
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
      saveState(window.localStorage, reducer(initialState(), { type: "remove-metric", id: "arr" }))

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
        <MetricsProvider>
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
      expect(screen.queryByRole("article", { name: "ARR" })).not.toBeInTheDocument()
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

    it("the Expenses tab card is labelled as sample data", () => {
      renderTabs("tab=expenses")
      expect(within(card("Expenses")).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    })
  })

  describe("Overview", () => {
    it("shows the eight default cards, in order, with value, trend and caption", () => {
      renderTabs()
      const names = cards().map((a) => a.getAttribute("aria-label"))
      expect(names).toEqual([
        "MRR",
        "ARR",
        "Churn Rate",
        "Revenue",
        "Retention",
        "Subscribers",
        "Trial Conversions",
        "Expenses",
      ])
      const mrr = card("MRR")
      expect(within(mrr).getByTestId("metric-value")).toHaveTextContent("$26,190")
      expect(within(mrr).getByTestId("trend")).toHaveTextContent("+4.2%")
      expect(within(mrr).getByTestId("trend")).toHaveAttribute("data-good", "true")
      expect(within(mrr).getByText("compared to last month")).toBeInTheDocument()

      const exp = card("Expenses")
      expect(within(exp).getByTestId("trend")).toHaveAttribute("data-good", "false")
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
      expect(within(card("MRR")).getByRole("img", { name: /line chart/ })).toBeInTheDocument()
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

    it("shows an empty state when every card is removed and the picker lists all fifteen", async () => {
      const user = userEvent.setup()
      renderTabs()
      for (const name of ["MRR", "ARR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses"]) {
        await user.click(within(card(name)).getByRole("button", { name: `Remove ${name}` }))
      }
      expect(screen.queryByRole("region", { name: "Metric cards" })).not.toBeInTheDocument()
      expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("No metrics on the board")

      await user.click(screen.getByRole("button", { name: "Add metric" }))
      const picker = await screen.findByRole("dialog", { name: "Add a metric" })
      expect(within(picker).getAllByRole("button")).toHaveLength(15)
    })

    it("tells you when everything is already on the board", async () => {
      const user = userEvent.setup()
      renderTabs()
      for (let i = 0; i < 7; i++) {
        await user.click(screen.getByRole("button", { name: "Add metric" }))
        const picker = await screen.findByRole("dialog", { name: "Add a metric" })
        await user.click(within(picker).getAllByRole("button")[0])
      }
      expect(cards()).toHaveLength(15)
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
      expect(within(exp).getByTestId("metric-value")).toHaveTextContent("$8,240")
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
      expect(within(card("Expenses")).getByTestId("metric-value")).toHaveTextContent("$8,400")
      expect(within(card("Expenses")).getByTestId("trend")).toHaveTextContent("+4.3%")
    })

    it("removes an expense and the card total follows", async () => {
      const user = userEvent.setup()
      renderTabs("tab=expenses")
      await user.click(screen.getByRole("button", { name: "Remove AWS" }))
      const table = screen.getByRole("table", { name: "Expenses" })
      expect(within(table).queryByText("AWS")).not.toBeInTheDocument()
      expect(within(card("Expenses")).getByTestId("metric-value")).toHaveTextContent("$2,830")
      expect(within(card("Expenses")).getByTestId("trend")).toHaveAttribute("data-good", "true")
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
        within(screen.getAllByRole("article", { name: "Expenses" }).at(-1)!).getByRole("button", {
          name: "Expenses: line chart",
        })
      ).toHaveAttribute("aria-pressed", "true")
    })
  })
})
