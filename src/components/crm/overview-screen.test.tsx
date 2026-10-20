import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LOCAL_EDITS_KEY } from "@/lib/crm/local-edits"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { FIXTURE_SUBJECTS, crmEmptySummary, crmFixtureSummary, setCrmSummaryForTest } from "@/test/crm"
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
  it("the four count cards link into the filtered Cases list", () => {
    renderOverview()
    expect(screen.getByRole("link", { name: "3 Open" })).toHaveAttribute("href", "/crm/cases")
    expect(screen.getByRole("link", { name: "2 Waiting on you" })).toHaveAttribute("href", "/crm/cases?waiting=1")
    expect(screen.getByRole("link", { name: "1 Waiting on them" })).toHaveAttribute("href", "/crm/cases?status=waiting_on_them")
    expect(screen.getByRole("link", { name: "1 Closed this week" })).toHaveAttribute("href", "/crm/cases?status=closed")
    expect(screen.getByTestId("crm-live-region")).toHaveTextContent("3 open, 2 waiting on you")
  })

  it("oldest waiting on you: longest wait first, each opening its case", () => {
    renderOverview()
    const list = screen.getByRole("list", { name: "Oldest waiting on you" })
    const links = within(list).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining(FIXTURE_SUBJECTS.overdue),
      expect.stringContaining(FIXTURE_SUBJECTS.urgent),
    ])
    expect(links[0]).toHaveAttribute("href", "/crm/cases?case=case-test-2")
    // Five days waiting: overdue, in the danger colour.
    expect(within(links[0]!).getByTitle("Waiting on your reply for over three days")).toHaveClass("text-danger-text")
  })

  it("recent activity: newest first, with the case subject, linking to the case", () => {
    renderOverview()
    const list = screen.getByRole("list", { name: "Recent activity" })
    const links = within(list).getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveTextContent(FIXTURE_SUBJECTS.urgent)
    expect(links[0]).toHaveTextContent("Received")
    expect(links[1]).toHaveAttribute("href", "/crm/cases?case=case-test-3")
  })

  it("a status changed in this browser moves the counts and the list", () => {
    window.localStorage.setItem(
      LOCAL_EDITS_KEY,
      JSON.stringify({ "case-test-2": { status: { value: "closed", from: "open" }, at: new Date(FIXED_NOW_MS).toISOString() } })
    )
    renderOverview()
    expect(screen.getByRole("link", { name: "2 Open" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 Waiting on you" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 Closed this week" })).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Oldest waiting on you" })).getAllByRole("link")).toHaveLength(1)
  })

  it("connected but empty: zeros are real here, and each list says so", () => {
    setCrmSummaryForTest(crmEmptySummary(FIXED_NOW_MS))
    renderOverview()
    expect(screen.getByRole("link", { name: "0 Open" })).toBeInTheDocument()
    expect(screen.getByText(NO_WAITING)).toBeInTheDocument()
    expect(screen.getByText(NO_ACTIVITY)).toBeInTheDocument()
  })

  it("stale: Last updated above the tiles", () => {
    setCrmSummaryForTest({ ...LIVE, status: "stale", lastUpdated: new Date(FIXED_NOW_MS - 2 * 3_600_000).toISOString() })
    renderOverview()
    expect(screen.getByTestId("crm-stale")).toHaveTextContent("Last updated 2h ago")
  })
})
