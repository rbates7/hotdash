import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  type State,
} from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"
import { KpiCard } from "@/components/home/kpi-strip"
import { NumberOneStrip } from "@/components/home/number-one-strip"

function renderHome(pulse = "Wednesday pulse") {
  return render(
    <IssuesProvider>
      <HomeScreen pulse={pulse} />
    </IssuesProvider>
  )
}

/** Pre-seed the browser copy the store hydrates from after mount. */
function seedStore(mutate: (state: State) => State) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mutate(initialState())))
}

describe("HomeScreen", () => {
  it("shows the heading, the day's pulse and the dummy stamp", () => {
    renderHome("Wednesday pulse")
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument()
    expect(screen.getByText("Wednesday pulse")).toBeInTheDocument()
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

  it("renders the four KPI cards with their deltas toned", () => {
    renderHome()
    const strip = screen.getByRole("region", { name: "KPI strip" })
    const cards = within(strip).getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "MRR",
      "ARR",
      "Subscribers",
      "Churn Rate",
    ])
    expect(within(cards[0]).getByText("$26,190")).toBeInTheDocument()
    expect(within(cards[0]).getByText(/\+4\.2%/)).toHaveAttribute("data-tone", "good")
    expect(within(cards[2]).getByText("186")).toBeInTheDocument()
    // Churn fell, which is the good direction for churn.
    expect(within(cards[3]).getByText(/−0\.4 pts/)).toHaveAttribute("data-tone", "good")
    expect(within(cards[3]).getByText("Down", { exact: false })).toBeInTheDocument()
  })

  it("labels the KPI strip as sample data and ties every card to the label", () => {
    renderHome()
    const strip = screen.getByRole("region", { name: "KPI strip" })
    const note = within(strip).getByRole("note")
    expect(note).toHaveTextContent(/^Sample data/)
    expect(note).toHaveTextContent("figures are invented, not live")
    expect(note).toBeVisible()
    for (const card of within(strip).getAllByRole("article")) {
      expect(card).toHaveAccessibleDescription(/Sample data/)
    }
  })

  it("has three doors, each opening its page", () => {
    renderHome()
    const doors = screen.getByRole("group", { name: "Doors" })
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
  })

  it("previews the dev board from the running sprint", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Agent Workplace" })
    expect(within(door).getByText("3 agents working")).toBeInTheDocument()
    expect(within(door).getByText("Dev board · Sprint 4")).toBeInTheDocument()
    const columns = within(within(door).getByRole("list", { name: "Columns" })).getAllByRole("listitem")
    expect(columns.map((c) => c.textContent)).toEqual([
      "3To Do",
      "3In Progress",
      "2In Review",
      "3Done",
      "2Blocked",
    ])
    expect(within(door).getByText("3/13 done")).toBeInTheDocument()
    expect(within(door).getByText("Sprint 4 · 9 days left")).toBeInTheDocument()
  })

  it("lists what needs you, capped and linked to each ticket", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(within(door).getByText("2 waiting")).toBeInTheDocument()
    const rows = within(within(door).getByRole("list", { name: "Needs you" })).getAllByRole("link")
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      "/agent-workplace?tab=inbox&issue=CHLK-408",
      "/agent-workplace?tab=inbox&issue=CHLK-412",
      "/agent-workplace?tab=inbox&issue=CHLK-406",
    ])
    expect(rows).toHaveLength(3)
    // Dismissed digests do not come to Home.
    expect(within(door).queryByText("Daily standup summary")).not.toBeInTheDocument()
    expect(within(door).getByText("Needs you lives here.")).toBeInTheDocument()
  })

  it("previews metrics with a trend chart", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Metrics" })
    expect(within(door).getByRole("img", { name: /MRR over 12 weeks/ })).toBeInTheDocument()
    expect(within(door).getByText("$21.8k → $26.2k")).toBeInTheDocument()
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

  it("empties the Needs-you door once the linked tickets are closed", async () => {
    seedStore((s) => ({
      ...s,
      issues: s.issues.map((i) =>
        ["CHLK-408", "CHLK-412", "CHLK-406"].includes(i.key)
          ? { ...i, status: "done" }
          : i
      ),
    }))
    renderHome()
    const door = screen.getByRole("region", { name: "Inbox" })
    expect(await within(door).findByText("Nothing needs you")).toBeInTheDocument()
    expect(within(door).queryByText(/waiting/)).not.toBeInTheDocument()
    expect(within(door).queryByRole("list", { name: "Needs you" })).not.toBeInTheDocument()
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
