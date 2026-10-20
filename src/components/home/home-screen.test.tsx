import { renderToStaticMarkup } from "react-dom/server"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { DevBoardDoor } from "@/components/home/dev-board-door"
import { HomeScreen } from "@/components/home/home-screen"
import { KPI_SET_TITLES, kpiSets } from "@/lib/home-fixture"
import { notConnectedKpi } from "@/lib/live-metrics"
import { todayIn } from "@/lib/clock"
import { truthStrip } from "@/lib/kpis"
import { KpiCard, KpiStrip } from "@/components/home/kpi-strip"
import { NeedsYouDoor, inboxIssueHref } from "@/components/home/needs-you-door"
import { NumberOneStrip } from "@/components/home/number-one-strip"
import { configureInbox } from "@/hooks/use-inbox"
import { emptyInbox, liveInbox, mixedInbox, notConnectedInbox, staleInbox } from "@/test/inbox-fixture"

function renderHome() {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <HomeScreen />
    </IssuesProvider>
  )
}

describe("HomeScreen", () => {
  it("shows the heading and the day's pulse, with no dummy stamp or persistence note", () => {
    renderHome()
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument()
    // FIXED_NOW is Thursday in Central, the default zone.
    expect(screen.getByText("Thursday pulse")).toBeInTheDocument()
    expect(screen.queryByText(/Dummy/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
  })

  it("has no placeholder #1: the honest empty state, saying it will come from My Desk", () => {
    renderHome()
    const strip = screen.getByRole("region", { name: "Number one" })
    expect(within(strip).getByText("#1")).toBeInTheDocument()
    expect(within(strip).getByRole("heading", { level: 2, name: "No #1 yet" })).toBeInTheDocument()
    // My Desk is not connected and has no picker: say where it will come from, not "pick one".
    expect(within(strip).getByText("Your #1 will come from My Desk once it\u2019s connected.")).toBeInTheDocument()
    expect(within(strip).queryByText(/Pick one on My Desk/)).not.toBeInTheDocument()
    expect(within(strip).queryByText(/Aledo/)).not.toBeInTheDocument()
    expect(within(strip).getByRole("link", { name: "My Desk" })).toHaveAttribute("href", "/my-desk")
  })

  it("with Stripe not connected, every KPI card says Not connected and shows no figure", async () => {
    renderHome()
    const today = todayIn(FIXED_NOW)
    const [subs, cash] = truthStrip({ today })
    const strip = screen.getByRole("region", { name: "KPI strip" })
    expect(within(strip).getByRole("heading", { level: 2, name: "Truth strip" })).toBeInTheDocument()
    const cards = within(strip).getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Subscribers", "Cash this week", "Paying coaches"])
    for (const card of cards) {
      expect(await within(card).findByText("Not connected")).toBeInTheDocument()
      expect(card).toHaveAttribute("data-source", "not_connected")
      expect(within(card).getByText("\u2014")).toBeInTheDocument()
    }
    expect(within(strip).queryByText(subs.value)).not.toBeInTheDocument()
    expect(within(strip).queryByText(cash.value)).not.toBeInTheDocument()
    expect(within(strip).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(within(strip).queryByText("figures are invented, not live", { exact: false })).not.toBeInTheDocument()
  })

  it("the growth set with no source (notConnectedKpi, as liveKpis does without a key) is four Not connected cards, no chips", () => {
    render(<KpiStrip kpis={kpiSets("2026-08-21").growth.map(notConnectedKpi)} title={KPI_SET_TITLES.growth} />)
    const cards = screen.getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["MRR", "ARR", "Subscribers", "Churn Rate"])
    expect(screen.getAllByText("Not connected")).toHaveLength(4)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
  })

  it("has three doors, each opening its page", () => {
    renderHome()
    const doors = screen.getByRole("group", { name: "Doors" })
    expect(doors.className).toContain("md:grid-cols-2")
    expect(doors.className).toContain("xl:grid-cols-3")
    const sections = within(doors).getAllByRole("region")
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Metrics", "Agent Workplace", "Inbox"])
    expect(within(sections[0]).getByRole("link", { name: "Open Metrics" })).toHaveAttribute("href", "/metrics")
    expect(within(sections[1]).getByRole("link", { name: "Open Agent Workplace" })).toHaveAttribute("href", "/agent-workplace")
    expect(within(sections[2]).getByRole("link", { name: "Open Inbox" })).toHaveAttribute("href", "/agent-workplace?tab=inbox")
    expect(sections[2].className).toContain("md:col-span-2")
    expect(sections[2].className).toContain("xl:col-span-1")
  })

  it("the Agent Workplace door says Not connected: no sprint, counts or agents", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Agent Workplace" })
    expect(within(door).getByTestId("door-not-connected")).toHaveTextContent("Not connected")
    expect(within(door).queryByText(/agents? working/)).not.toBeInTheDocument()
    expect(within(door).queryByText(/Sprint 4/)).not.toBeInTheDocument()
    expect(within(door).queryByRole("list", { name: "Columns" })).not.toBeInTheDocument()
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

  it("mixed (GitHub live, Sentry stale): shows Sentry's last sync next to the rows", async () => {
    configureInbox({ fetcher: () => Promise.resolve(mixedInbox(Date.now())) })
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByTestId("needs-you-updated")).toHaveTextContent(/^Sentry: Last updated /)
    // In the footer's place (no extra line above the rows), so Home fits 1440×900.
    expect(within(door).queryByText("Needs you lives here.")).not.toBeInTheDocument()
    const list = within(door).getByRole("list", { name: "Needs you" })
    expect(list.compareDocumentPosition(within(door).getByTestId("needs-you-updated")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    configureInbox({})
  })

  it("stale with one time for both sources says it once", async () => {
    configureInbox({ fetcher: () => Promise.resolve(staleInbox(Date.now())) })
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByTestId("needs-you-updated")).toHaveTextContent(/^GitHub and Sentry: Last updated /)
    expect(within(door).getByTestId("needs-you-updated")).not.toHaveTextContent(/·\s*Sentry:/)
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
    expect(await within(door).findByTestId("door-not-connected")).toHaveTextContent("Not connected")
    expect(within(door).queryByText(/waiting/)).not.toBeInTheDocument()
    configureInbox({})
  })

  it("the Metrics door has no sample series with Stripe not connected", async () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Metrics" })
    expect(await within(door).findByText("Not connected")).toBeInTheDocument()
    expect(within(door).queryByRole("img")).not.toBeInTheDocument()
    expect(within(door).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(within(door).getByText("No figures until Stripe is connected.")).toBeInTheDocument()
  })
})

describe("HomeScreen server HTML", () => {
  it("waits for Stripe with placeholders and carries no sample content", () => {
    const html = renderToStaticMarkup(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <HomeScreen />
      </IssuesProvider>
    )
    expect(html).not.toContain("Aledo")
    expect(html).not.toContain("Dummy")
    expect(html).not.toContain("agents working")
    expect(html).not.toContain("waiting")
    expect(html).toContain("No #1 yet")
    expect(html).toContain('aria-label="Subscribers" aria-busy="true" data-source="loading"')
    expect(html).toContain('aria-label="Cash this week" aria-busy="true" data-source="loading"')
    expect(html).not.toContain("figures are invented, not live")
    expect(html).not.toContain('data-testid="sample-data-tag"')
    // The ticker shows its loading row, not a figure.
    expect(html).toContain('<span class="sr-only">Loading subscriber count</span>')
  })
})

describe("Not connected door states", () => {
  it("DevBoardDoor notConnected hides count and caption", () => {
    render(<DevBoardDoor preview={null} notConnected />)
    expect(screen.getByTestId("door-not-connected")).toBeInTheDocument()
    expect(screen.queryByText(/Backlog tab/)).not.toBeInTheDocument()
  })

  it("NeedsYouDoor not connected ignores any rows it is handed", () => {
    render(
      <NeedsYouDoor
        status="not_connected"
        now={FIXED_NOW}
        needs={{
          items: [{ id: "x", title: "Row", snippet: "", at: FIXED_NOW.toISOString(), unread: true }],
          waiting: 1,
          overflow: 0,
        }}
      />
    )
    expect(screen.getByTestId("door-not-connected")).toBeInTheDocument()
    expect(screen.queryByText("1 waiting")).not.toBeInTheDocument()
    expect(screen.queryByText("Row")).not.toBeInTheDocument()
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
