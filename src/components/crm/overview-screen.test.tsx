import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CRM_CONNECTING } from "@/lib/crm/case-view"
import { LOCAL_EDITS_KEY } from "@/lib/crm/local-edits"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import {
  FIXTURE_SUBJECTS,
  crmEmptySummary,
  crmFixtureSummary,
  crmNotConnectedBody,
  setCrmSummaryForTest,
} from "@/test/crm"
import { CrmProvider } from "@/components/crm/crm-store"
import { NO_ACTIVITY, NO_WAITING, OverviewScreen } from "@/components/crm/overview-screen"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm",
}))

vi.mock("@/lib/clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clock")>()
  return { ...actual, now: () => new Date(FIXED_NOW_MS) }
})

const LIVE = crmFixtureSummary(FIXED_NOW_MS)
const renderOverview = () =>
  render(
    <CrmProvider nowMs={FIXED_NOW_MS}>
      <OverviewScreen />
    </CrmProvider>
  )

beforeEach(() => setCrmSummaryForTest(LIVE))

describe("Overview", () => {
  it("the count cards link into the filtered Cases list", () => {
    renderOverview()
    expect(screen.getByRole("link", { name: "3 Open" })).toHaveAttribute("href", "/crm/cases")
    expect(screen.getByRole("link", { name: "2 Waiting on you" })).toHaveAttribute("href", "/crm/cases?waiting=1")
    expect(screen.getByRole("link", { name: "1 Waiting on them" })).toHaveAttribute("href", "/crm/cases?status=waiting_on_them")
    expect(screen.getByRole("link", { name: "1 Urgent, not closed" })).toHaveAttribute("href", "/crm/cases?priority=urgent")
    expect(screen.getByRole("link", { name: "1 Waiting on you over 3 days" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 Closed this week" })).toHaveAttribute("href", "/crm/cases?status=closed")
    expect(screen.getByTestId("crm-live-region")).toHaveTextContent("3 open, 2 waiting on you")
    expect(screen.getByTestId("crm-overview-summary")).toHaveTextContent("1 account · 3 open cases · 1 waiting on them")
  })

  it("Urgent and over-3-days read danger-text only above 0 (spec §1)", () => {
    renderOverview()
    const urgent = screen.getByRole("link", { name: "1 Urgent, not closed" })
    expect(urgent.querySelector(".text-danger-text")).not.toBeNull()
    expect(screen.getByRole("link", { name: "2 Waiting on you" }).querySelector(".text-danger-text")).toBeNull()
  })

  it("oldest waiting on you: longest wait first, #id, status badge, each opening its case", () => {
    renderOverview()
    const list = screen.getByRole("list", { name: "Oldest waiting on you" })
    const links = within(list).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining(FIXTURE_SUBJECTS.overdue),
      expect.stringContaining(FIXTURE_SUBJECTS.urgent),
    ])
    expect(links[0]).toHaveTextContent("#2")
    expect(within(links[0]!).getByTestId("crm-status-badge")).toHaveClass("text-info-text")
    expect(links[0]).toHaveAttribute("href", "/crm/cases?case=case-2")
    // Five days waiting: overdue, in the danger colour.
    expect(within(links[0]!).getByTitle("Waiting on your reply for over three days")).toHaveClass("text-danger-text")
  })

  it("recent activity: text from type + actor, newest first, linking to the case", () => {
    renderOverview()
    const list = screen.getByRole("list", { name: "Recent activity" })
    const links = within(list).getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveTextContent(`Test Person Alpha wrote on #1 — ${FIXTURE_SUBJECTS.urgent}`)
    expect(links[1]).toHaveTextContent(`You replied on #3 — ${FIXTURE_SUBJECTS.waiting}`)
    expect(links[1]).toHaveAttribute("href", "/crm/cases?case=case-3")
  })

  it("a status changed in this browser moves the counts and the list", () => {
    window.localStorage.setItem(
      LOCAL_EDITS_KEY,
      JSON.stringify({ "case-2": { status: { value: "closed", from: "waiting_on_us" }, at: new Date(FIXED_NOW_MS).toISOString() } })
    )
    renderOverview()
    expect(screen.getByRole("link", { name: "2 Open" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 Waiting on you" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 Closed this week" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "0 Waiting on you over 3 days" })).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Oldest waiting on you" })).getAllByRole("link")).toHaveLength(1)
  })

  it("connected but empty: zeros are real here, and each list says so", () => {
    setCrmSummaryForTest(crmEmptySummary(FIXED_NOW_MS))
    renderOverview()
    expect(screen.getByRole("link", { name: "0 Open" })).toBeInTheDocument()
    expect(screen.getByText(NO_WAITING)).toBeInTheDocument()
    expect(screen.getByText(NO_ACTIVITY)).toBeInTheDocument()
  })

  it("not connected: the route's zero counts are never shown as numbers", () => {
    setCrmSummaryForTest(crmNotConnectedBody())
    renderOverview()
    const cards = screen.getAllByTestId("crm-count")
    expect(cards).toHaveLength(6)
    for (const card of cards) {
      expect(card).toHaveTextContent("Not connected")
      expect(card.textContent).not.toMatch(/^\d/)
      expect(card.querySelector(".tabular-nums")).toBeNull()
    }
    expect(screen.queryByRole("link", { name: /^0 / })).not.toBeInTheDocument()
    expect(screen.queryByTestId("crm-overview-summary")).not.toBeInTheDocument()
  })

  it("connecting: Connecting…, never 0", () => {
    setCrmSummaryForTest(CRM_CONNECTING)
    renderOverview()
    for (const card of screen.getAllByTestId("crm-count")) {
      expect(card).toHaveTextContent("Connecting…")
      expect(card.textContent).not.toMatch(/^\d/)
      expect(card.querySelector(".tabular-nums")).toBeNull()
    }
  })

  it("stale: Last updated above the tiles", () => {
    setCrmSummaryForTest({ ...LIVE, status: "stale", lastUpdated: new Date(FIXED_NOW_MS - 2 * 3_600_000).toISOString() })
    renderOverview()
    expect(screen.getByTestId("crm-stale")).toHaveTextContent("Last updated 2h ago")
  })
})
