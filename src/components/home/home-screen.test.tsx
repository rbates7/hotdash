import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  type State,
} from "@/components/agent-workplace/issues-store"
import { DevBoardDoor } from "@/components/home/dev-board-door"
import { HomeScreen } from "@/components/home/home-screen"
import { KPI_SET_TITLES, kpiSets } from "@/lib/home-fixture"
import { todayIn } from "@/lib/clock"
import { snapshotFor, truthStrip } from "@/lib/kpis"
import { formatMetricValue } from "@/lib/metrics"
import { KpiCard, KpiStrip } from "@/components/home/kpi-strip"
import { NeedsYouDoor, inboxIssueHref } from "@/components/home/needs-you-door"
import { NumberOneStrip } from "@/components/home/number-one-strip"
import { configureInbox } from "@/hooks/use-inbox"
import { emptyInbox, liveInbox, mixedInbox, notConnectedInbox } from "@/test/inbox-fixture"

function renderHome() {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <HomeScreen />
    </IssuesProvider>
  )
}

/** Pre-seed the browser copy the store hydrates from after mount. */
function seedStore(mutate: (state: State) => State) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mutate(initialState(FIXED_NOW))))
}

describe("HomeScreen", () => {
  it("shows the heading, the day's pulse and the dummy stamp", () => {
    renderHome()
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument()
    // FIXED_NOW is Thursday in Central, the default zone.
    expect(screen.getByText("Thursday pulse")).toBeInTheDocument()
    expect(screen.getByText("Dummy / design mock")).toBeInTheDocument()
  })

  it("pins the #1 with a pointer back to My Desk", () => {
    renderHome()
    const strip = screen.getByRole("region", { name: "Number one" })
    expect(within(strip).getByText("#1")).toBeInTheDocument()
    expect(
      within(strip).getByRole("heading", { level: 2, name: "Call Aledo before Friday" })
    ).toBeInTheDocument()
    expect(within(strip).getByText("Dummy · Friday walk-through")).toBeInTheDocument()
    expect(within(strip).getByRole("link", { name: "My Desk" })).toHaveAttribute(
      "href",
      "/my-desk"
    )
  })

  it("renders the truth strip: subscribers and cash this week, from the shared KPI fixture, deltas toned", () => {
    renderHome()
    const today = todayIn(FIXED_NOW)
    const [subs, cash] = truthStrip({ today })
    const strip = screen.getByRole("region", { name: "KPI strip" })
    expect(within(strip).getByRole("heading", { level: 2, name: "Truth strip" })).toBeInTheDocument()
    const cards = within(strip).getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Subscribers", "Cash this week"])
    expect(within(cards[0]).getByText(subs.value)).toBeInTheDocument()
    expect(within(cards[0]).getByText("186")).toBeInTheDocument()
    expect(within(cards[0]).getByText(/\+3 vs previous 28 days/)).toHaveAttribute("data-tone", "good")
    expect(within(cards[1]).getByText(cash.value)).toBeInTheDocument()
    // A real trailing-7-day sum of the daily revenue spread, not Revenue ÷ 4.
    expect(within(cards[1]).getByText("$7,848")).toBeInTheDocument()
    expect(within(cards[1]).getByText(/\+6\.8% vs previous 7 days/)).toHaveAttribute("data-tone", "good")
  })

  it("shows exactly what the Metrics page shows for the same day", () => {
    renderHome()
    const today = todayIn(FIXED_NOW)
    const subsCard = snapshotFor("subscribers", { today })
    const strip = screen.getByRole("region", { name: "KPI strip" })
    const subs = within(strip).getByRole("article", { name: "Subscribers" })
    expect(within(subs).getByText(formatMetricValue(subsCard.value, subsCard.unit))).toBeInTheDocument()

    const door = screen.getByRole("region", { name: "Metrics" })
    const mrr = snapshotFor("mrr", { today })
    expect(within(door).getByText("MRR · 6 × 28 days")).toBeInTheDocument()
    expect(within(door).getByText(/\$23\.8k → \$26\.2k/)).toBeInTheDocument()
    expect(mrr.series[0]).toBe(23_800)
    expect(mrr.series.at(-1)).toBe(26_190)
    expect(within(door).getByText(/the same MRR card as \/metrics/)).toBeInTheDocument()
  })

  it("labels the strip as sample data and puts a visible Sample data chip on every card", () => {
    renderHome()
    const strip = screen.getByRole("region", { name: "KPI strip" })
    const note = within(strip).getByRole("note")
    expect(note).toHaveTextContent(/^Sample data/)
    expect(note).toHaveTextContent("figures are invented, not live")
    expect(note).toBeVisible()
    const cards = within(strip).getAllByRole("article")
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      const chip = within(card).getByTestId("sample-data-tag")
      expect(chip).toHaveTextContent("Sample data")
      expect(chip).toBeVisible()
      expect(card).toHaveAccessibleDescription(/Sample data/)
    }
  })

  it("the growth set renders four cards, each still chipped", () => {
    render(<KpiStrip kpis={kpiSets("2026-08-21").growth} title={KPI_SET_TITLES.growth} />)
    expect(screen.getByRole("heading", { level: 2, name: "KPIs" })).toBeInTheDocument()
    const cards = screen.getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "MRR",
      "ARR",
      "Subscribers",
      "Churn Rate",
    ])
    // Churn fell (derived from the seed: 5 of 183), which is the good direction for churn.
    expect(within(cards[3]).getByText(/−1\.5 pts vs previous 28 days/)).toHaveAttribute("data-tone", "good")
    expect(within(cards[3]).getByText("Down", { exact: false })).toBeInTheDocument()
    // Four card chips plus the strip-level label.
    expect(screen.getAllByTestId("sample-data-tag")).toHaveLength(5)
  })

  it("has three doors, each opening its page", () => {
    renderHome()
    const doors = screen.getByRole("group", { name: "Doors" })
    expect(doors.className).toContain("md:grid-cols-2")
    expect(doors.className).toContain("xl:grid-cols-3")
    const sections = within(doors).getAllByRole("region")
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Metrics",
      "Agent Workplace",
      "Inbox",
    ])
    expect(within(sections[0]).getByRole("link", { name: "Open Metrics" })).toHaveAttribute("href", "/metrics")
    expect(within(sections[1]).getByRole("link", { name: "Open Agent Workplace" })).toHaveAttribute(
      "href",
      "/agent-workplace"
    )
    expect(within(sections[2]).getByRole("link", { name: "Open Inbox" })).toHaveAttribute(
      "href",
      "/agent-workplace?tab=inbox"
    )
    expect(sections[2].className).toContain("md:col-span-2")
    expect(sections[2].className).toContain("xl:col-span-1")
  })

  it("previews the dev board from the running sprint", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Agent Workplace" })
    expect(within(door).getByText("3 agents working")).toBeInTheDocument()
    expect(within(door).getByText("Dev board · Sprint 4")).toBeInTheDocument()
    const columnList = within(door).getByRole("list", { name: "Columns" })
    expect(columnList.className).toContain("grid-cols-3")
    expect(columnList.className).toContain("xl:grid-cols-5")
    const columns = within(columnList).getAllByRole("listitem")
    expect(columns.map((c) => c.textContent)).toEqual([
      "4To Do",
      "3In Progress",
      "3In Review",
      "4Done",
      "2Blocked",
    ])
    expect(within(door).getByText("4/16 done")).toBeInTheDocument()
    expect(within(door).getByText("Sprint 4 · 9 days left")).toBeInTheDocument()
  })

  it("lists what needs you from the live Inbox, each row opening the Workplace Inbox", async () => {
    configureInbox({ fetcher: () => Promise.resolve(liveInbox(Date.now())) })
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByText("3 waiting")).toBeInTheDocument()
    const rows = within(within(door).getByRole("list", { name: "Needs you" })).getAllByRole("link")
    // Only rows that need the founder: not "PR needs a fix", not ongoing Sentry.
    expect(rows).toHaveLength(3)
    expect(within(door).queryByText(/needs a fix|Ongoing/)).not.toBeInTheDocument()
    expect(new Set(rows.map((r) => r.getAttribute("href")))).toEqual(new Set(["/agent-workplace?tab=inbox"]))
    // None of the design mock's sample rows.
    expect(within(door).queryByText(/Agent blocked|Daily standup summary/)).not.toBeInTheDocument()
    expect(within(door).getByText("Needs you lives here.")).toBeInTheDocument()
    configureInbox({})
  })

  it("previews metrics with a trend chart, stamped as sample data", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Metrics" })
    // FIXED_NOW is 27 Aug 2026: six 28-day windows reach back to 13 Mar.
    expect(within(door).getByRole("img", { name: /MRR over 6 28-day windows, 13 Mar – 27 Aug 2026/ })).toBeInTheDocument()
    expect(within(door).getByText(/\$23\.8k → \$26\.2k/)).toBeInTheDocument()
    expect(within(door).getByTestId("sample-data-tag")).toHaveTextContent("Sample data")
  })

  it("empties the dev board door once the sprint is complete", async () => {
    seedStore((s) => ({
      ...s,
      sprints: s.sprints.map((sp) =>
        sp.status === "active" ? { ...sp, status: "completed" } : sp
      ),
    }))
    renderHome()
    const door = screen.getByRole("region", { name: "Agent Workplace" })
    expect(await within(door).findByText("No sprint is running")).toBeInTheDocument()
    expect(within(door).queryByText(/agents working/)).not.toBeInTheDocument()
    expect(within(door).getByText("Sprints are planned from the Backlog tab.")).toBeInTheDocument()
  })

  it("mixed (GitHub live, Sentry stale): shows Sentry's last sync next to the rows", async () => {
    configureInbox({ fetcher: () => Promise.resolve(mixedInbox(Date.now())) })
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByTestId("needs-you-updated")).toHaveTextContent(/^Sentry: Last updated /)
    configureInbox({})
  })

  it("shows Nothing needs you when connected and empty, and Not connected with no source", async () => {
    configureInbox({ fetcher: () => Promise.resolve(emptyInbox(Date.now())) })
    const first = renderHome()
    expect(await within(screen.getByRole("region", { name: "Inbox" })).findByText("Nothing needs you")).toBeInTheDocument()
    first.unmount()
    configureInbox({ fetcher: () => Promise.resolve(notConnectedInbox(Date.now())) })
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByText("Not connected")).toBeInTheDocument()
    expect(within(door).queryByText(/waiting/)).not.toBeInTheDocument()
    configureInbox({})
  })
})

describe("HomeScreen before the saved board is read", () => {
  it("server HTML shows placeholders, not the seed, and says edits are loading", () => {
    const html = renderToStaticMarkup(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <HomeScreen />
      </IssuesProvider>
    )
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain("Loading saved edits…")
    expect(html).not.toContain("agents working")
    expect(html).not.toContain("2 waiting")
    expect(html).not.toContain("Agent blocked")
    // The parts that do not depend on the browser copy render straight away.
    expect(html).toContain("Call Aledo before Friday")
    expect(html).toContain("Subscribers")
    // Stripe-fed figures wait for /api/stripe/summary: a placeholder, never
    // a sample number that could swap for a live one (or the reverse).
    expect(html).not.toContain("$7,848")
    expect(html).toContain('aria-label="Subscribers" aria-busy="true" data-source="loading"')
    expect(html).toContain('aria-label="Cash this week" aria-busy="true" data-source="loading"')
    expect(html).not.toContain("figures are invented, not live")
    expect(html).not.toContain('data-testid="sample-data-tag"')
    // The ticker shows its loading row, not a figure.
    expect(html).toContain('<span class="sr-only">Loading subscriber count</span>')
    expect(html).not.toContain("data-flap")
  })

  it("swaps to the data and the persistence note once mounted", async () => {
    renderHome()
    // Nothing has been edited in this browser yet, so nothing is saved.
    expect(await screen.findByTestId("persistence-note")).toHaveTextContent(
      "Edits save in this browser"
    )
    expect(screen.queryByLabelText(/Loading/)).not.toBeInTheDocument()
    expect(screen.getByText("3 agents working")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument()
  })
})

describe("door loading states", () => {
  it("DevBoardDoor hides the count and caption while loading", () => {
    render(<DevBoardDoor preview={null} loading />)
    expect(screen.getByLabelText("Loading the board")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByText("No sprint is running")).not.toBeInTheDocument()
    expect(screen.queryByText(/Backlog tab/)).not.toBeInTheDocument()
  })

  it("NeedsYouDoor hides the rows and the waiting pill while loading", () => {
    render(
      <NeedsYouDoor
        loading
        now={FIXED_NOW}
        needs={{
          items: [{ id: "x", title: "Row", snippet: "", at: FIXED_NOW.toISOString(), unread: true }],
          waiting: 1,
          overflow: 0,
        }}
      />
    )
    expect(screen.getByLabelText("Loading what needs you")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByText("1 waiting")).not.toBeInTheDocument()
    expect(screen.queryByText("Row")).not.toBeInTheDocument()
  })
})

describe("inboxIssueHref", () => {
  it("encodes the ticket key and falls back to the Inbox", () => {
    expect(inboxIssueHref("CHLK-408")).toBe("/agent-workplace?tab=inbox&issue=CHLK-408")
    expect(inboxIssueHref("CHLK 4&8#")).toBe(
      "/agent-workplace?tab=inbox&issue=CHLK%204%268%23"
    )
    expect(inboxIssueHref(undefined)).toBe("/agent-workplace?tab=inbox")
  })
})

describe("NumberOneStrip", () => {
  it("says so when nothing is pinned", () => {
    render(<NumberOneStrip item={null} />)
    expect(screen.getByRole("heading", { level: 2, name: "No #1 yet" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "My Desk" })).toBeInTheDocument()
  })
})

describe("KpiCard", () => {
  it("tones a rise in a lower-is-better metric as bad", () => {
    render(
      <KpiCard
        kpi={{
          id: "churn",
          label: "Churn Rate",
          value: "4.4%",
          delta: "+0.6 pts",
          direction: "up",
          lowerIsBetter: true,
        }}
      />
    )
    expect(screen.getByText(/\+0\.6 pts/)).toHaveAttribute("data-tone", "bad")
  })

  it("tones no movement as flat", () => {
    render(
      <KpiCard
        kpi={{ id: "arr", label: "ARR", value: "$314,280", delta: "0%", direction: "flat" }}
      />
    )
    expect(screen.getByText(/0%/)).toHaveAttribute("data-tone", "flat")
  })
})
