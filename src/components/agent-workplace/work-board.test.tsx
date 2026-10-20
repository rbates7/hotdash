import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WORKBOARD_LOADING_VIEW } from "@/lib/workboard-view"
import { LIVE_ITEMS, setWorkboardForTest, setWorkboardLoadingForTest, workboardSummary } from "@/test/workboard"
import { WorkBoard, WorkBoardView } from "./work-board"

const ready = (status: Parameters<typeof workboardSummary>[0], items?: Parameters<typeof workboardSummary>[1]) => ({
  phase: "ready" as const,
  summary: workboardSummary(status, items),
})

describe("WorkBoardView", () => {
  it("loading (no answer yet) says Connecting…, busy, with no cards", () => {
    render(<WorkBoardView view={WORKBOARD_LOADING_VIEW} />)
    const panel = screen.getByRole("region", { name: "Work board: connecting" })
    expect(panel).toHaveAttribute("aria-busy", "true")
    expect(within(panel).getByTestId("workboard-connecting-badge")).toHaveTextContent("Connecting…")
    expect(screen.queryAllByTestId("work-card")).toHaveLength(0)
  })

  it("the server's connecting status is the same Connecting… state", () => {
    render(<WorkBoardView view={ready("connecting")} />)
    expect(screen.getByTestId("workboard-connecting")).toBeInTheDocument()
    expect(screen.queryByTestId("workboard-not-connected")).toBeNull()
  })

  it("not connected: the Not connected panel, what feeds it, and no cards", () => {
    render(<WorkBoardView view={ready("not_connected")} />)
    const panel = screen.getByRole("region", { name: "Work board: not connected" })
    expect(within(panel).getByTestId("not-connected")).toHaveTextContent("Not connected")
    expect(panel).toHaveTextContent("Reads rbates7/hotdash's pull requests, CI and reviews from GitHub.")
    expect(screen.queryAllByTestId("work-card")).toHaveLength(0)
    expect(screen.queryByRole("region", { name: "Working" })).toBeNull()
  })

  it("connected with nothing on it: No open pull requests, no columns", () => {
    render(<WorkBoardView view={ready("connected", [])} />)
    const empty = screen.getByRole("region", { name: "Work board: no open pull requests" })
    expect(empty).toHaveTextContent("No open pull requests")
    expect(empty).toHaveTextContent("Checked Oct 16, 7:45 PM CDT.")
    expect(screen.queryAllByTestId("work-card")).toHaveLength(0)
    expect(screen.queryByTestId("workboard-stale")).toBeNull()
  })

  it("live: four columns, one card each, with owner, date, PR link, CI and review, and no other links", () => {
    render(<WorkBoardView view={ready("connected")} />)
    expect(screen.getAllByTestId("work-card")).toHaveLength(LIVE_ITEMS.length)
    for (const [name, number] of [["Working", 52], ["Needs fix", 50], ["Ready for review", 48], ["Merged", 46]] as const) {
      const col = screen.getByRole("region", { name })
      expect(within(col).getByRole("link", { name: new RegExp(`PR #${number}`) })).toHaveAttribute(
        "href",
        `https://github.com/rbates7/hotdash/pull/${number}`
      )
    }
    const ready48 = within(screen.getByRole("region", { name: "Ready for review" }))
    expect(ready48.getByText(/Simmons/)).toBeInTheDocument()
    expect(ready48.getByText(/Updated/)).toHaveTextContent("Simmons · Updated Oct 16, 5:10 PM CDT")
    const merged46 = within(screen.getByRole("region", { name: "Merged" }))
    const mergedAt = merged46.getByText("Oct 16, 10:00 AM CDT")
    expect(mergedAt).toHaveAttribute("datetime", "2026-10-16T15:00:00Z")
    expect(mergedAt.closest("p")).toHaveTextContent("rbates7 · Merged Oct 16, 10:00 AM CDT")
    expect(ready48.getByText("CI passing")).toBeInTheDocument()
    expect(ready48.getByText("Review pending")).toBeInTheDocument()
    const link = ready48.getByRole("link", { name: /PR #48/ })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    // One link per card, GitHub's PR URL: no Proof links, no branch.
    expect(screen.queryByRole("link", { name: /Proof/ })).toBeNull()
    expect(screen.queryByText(/feat\//)).toBeNull()
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href")).sort()).toEqual(
      LIVE_ITEMS.map((i) => `https://github.com/rbates7/hotdash/pull/${i.number}`).sort()
    )
    expect(screen.getByText("From GitHub · updated Oct 16, 7:45 PM CDT")).toBeInTheDocument()
    expect(screen.queryByTestId("workboard-stale")).toBeNull()
  })

  it("a column with no rows says None, never a placeholder card", () => {
    render(<WorkBoardView view={ready("connected", [LIVE_ITEMS[2]])} />)
    expect(within(screen.getByRole("region", { name: "Working" })).getByText("None")).toBeInTheDocument()
    expect(screen.getAllByTestId("work-card")).toHaveLength(1)
  })

  it("stale: the last good rows under a note with the time they are from", () => {
    render(<WorkBoardView view={ready("stale")} />)
    expect(screen.getByTestId("workboard-stale")).toHaveTextContent(
      "GitHub could not be read just now. Showing the last good copy, from Oct 16, 7:45 PM CDT."
    )
    expect(screen.getAllByTestId("work-card")).toHaveLength(LIVE_ITEMS.length)
  })

  it("stale and empty: the note plus No open pull requests", () => {
    render(<WorkBoardView view={ready("stale", [])} />)
    expect(screen.getByTestId("workboard-stale")).toBeInTheDocument()
    expect(screen.getByTestId("workboard-empty")).toBeInTheDocument()
  })

  it("badge tones beat the outline variant: red for failing/changes requested, amber for pending, green for passing/approved", () => {
    const items = [
      { ...LIVE_ITEMS[0], number: 1, ci: "failing" as const, review: "changes_requested" as const },
      { ...LIVE_ITEMS[0], number: 2, ci: "pending" as const, review: "pending" as const },
      { ...LIVE_ITEMS[0], number: 3, ci: "passing" as const, review: "approved" as const },
      { ...LIVE_ITEMS[0], number: 4, ci: "none" as const, review: "none" as const },
    ]
    render(<WorkBoardView view={ready("connected", items)} />)
    const tone = (name: string) => screen.getByText(name).closest("[data-slot='badge']")!.className
    expect(tone("CI failing")).toMatch(/(^|\s)text-danger-text!(\s|$)/)
    expect(tone("Changes requested")).toMatch(/(^|\s)text-danger-text!(\s|$)/)
    expect(tone("CI pending")).toMatch(/(^|\s)text-warning-text!(\s|$)/)
    expect(tone("Review pending")).toMatch(/(^|\s)text-warning-text!(\s|$)/)
    expect(tone("CI passing")).toMatch(/(^|\s)text-success-text!(\s|$)/)
    expect(tone("Approved")).toMatch(/(^|\s)text-success-text!(\s|$)/)
    expect(tone("No CI")).toMatch(/(^|\s)text-muted-foreground!(\s|$)/)
    // The word is its own span, inheriting the badge's colour.
    expect(screen.getByText("CI failing").tagName).toBe("SPAN")
    expect(screen.getByText("CI failing").className).toBe("")
  })

  it("touch targets: links carry the 44px min below 1280", () => {
    render(<WorkBoardView view={ready("connected")} />)
    for (const link of screen.getAllByRole("link")) expect(link.className).toMatch(/\bmin-h-11\b.*\bxl:min-h-0\b/)
  })
})

describe("WorkBoardView live region", () => {
  const region = () => screen.getByTestId("workboard-announce")

  it("is one polite, atomic, visually hidden status region", () => {
    render(<WorkBoardView view={ready("connected")} />)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(region()).toHaveAttribute("role", "status")
    expect(region()).toHaveAttribute("aria-live", "polite")
    expect(region()).toHaveAttribute("aria-atomic", "true")
    expect(region()).toHaveClass("sr-only")
  })

  it.each([
    ["loading", WORKBOARD_LOADING_VIEW, "Connecting…"],
    ["connecting", ready("connecting"), "Connecting…"],
    ["not connected", ready("not_connected"), "Not connected"],
    ["empty", ready("connected", []), "No open pull requests"],
    ["live", ready("connected"), "4 PRs updated Oct 16, 7:45 PM CDT"],
    ["live, one PR", ready("connected", [LIVE_ITEMS[2]]), "1 PR updated Oct 16, 7:45 PM CDT"],
    ["stale", ready("stale"), "GitHub could not be read just now. Showing the last good copy, from Oct 16, 7:45 PM CDT."],
    ["stale and empty", ready("stale", []), "GitHub could not be read just now. Showing the last good copy, from Oct 16, 7:45 PM CDT."],
  ] as const)("%s announces %j", (_name, view, text) => {
    render(<WorkBoardView view={view} />)
    expect(region()).toHaveTextContent(text)
    expect(screen.getAllByRole("status")).toHaveLength(1)
  })

  it("stays the same node when the state changes, so the change is announced", () => {
    const { rerender } = render(<WorkBoardView view={ready("connecting")} />)
    const node = region()
    rerender(<WorkBoardView view={ready("connected")} />)
    expect(region()).toBe(node)
    expect(node).toHaveTextContent("4 PRs updated Oct 16, 7:45 PM CDT")
    rerender(<WorkBoardView view={ready("stale")} />)
    expect(region()).toBe(node)
    expect(node).toHaveTextContent(/^GitHub could not be read just now/)
  })
})

describe("WorkBoard (store)", () => {
  it("starts not connected in tests (no server), with no cards", () => {
    render(<WorkBoard />)
    expect(screen.getByTestId("workboard-not-connected")).toBeInTheDocument()
  })

  it("reads the store: loading, then live rows", () => {
    setWorkboardLoadingForTest()
    const { unmount } = render(<WorkBoard />)
    expect(screen.getByTestId("workboard-connecting")).toBeInTheDocument()
    unmount()
    setWorkboardForTest(workboardSummary("connected"))
    render(<WorkBoard />)
    expect(screen.getAllByTestId("work-card")).toHaveLength(LIVE_ITEMS.length)
  })
})
