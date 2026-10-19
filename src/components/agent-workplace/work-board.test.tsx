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

  it("live: four columns, one card each, with owner, branch, PR link, CI, review and proof", () => {
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
    expect(ready48.getByText("feat/suspect-zero")).toBeInTheDocument()
    expect(ready48.getByText("CI passing")).toBeInTheDocument()
    expect(ready48.getByText("Review pending")).toBeInTheDocument()
    const proof = ready48.getByRole("link", { name: /Proof/ })
    expect(proof).toHaveAttribute("target", "_blank")
    expect(proof).toHaveAttribute("rel", "noopener noreferrer")
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
