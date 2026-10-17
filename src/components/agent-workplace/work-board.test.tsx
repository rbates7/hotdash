import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { parseWorkboard } from "@/lib/workboard"
import { FIXTURE } from "@/test/workboard-fixture"
import { WorkBoardView } from "./work-board"

describe("WorkBoardView", () => {
  it("shows Not connected and no cards", () => {
    render(<WorkBoardView load={{ kind: "ready", board: parseWorkboard({ connected: false, fetchedAt: "", stale: false, items: [] }) }} />)
    expect(screen.getByText("Not connected")).toBeTruthy()
    expect(screen.queryAllByTestId("work-card")).toHaveLength(0)
  })
  it("renders four columns and a card with owner, branch, PR, CI, review and proof", () => {
    render(<WorkBoardView load={{ kind: "ready", board: parseWorkboard(FIXTURE) }} />)
    for (const c of ["Working", "Needs fix", "Ready for review", "Merged"]) expect(screen.getByRole("region", { name: c })).toBeTruthy()
    expect(screen.getByText(/Simmons/)).toBeTruthy()
    expect(screen.getByText("feat/suspect-zero")).toBeTruthy()
    expect(screen.getByRole("link", { name: /PR #48/ }).getAttribute("href")).toBe(FIXTURE.items[0].url)
    expect(screen.getByText("CI passing")).toBeTruthy()
    expect(screen.getByText("Review pending")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Proof/ })).toBeTruthy()
  })
  it("shows a stale note", () => {
    render(<WorkBoardView load={{ kind: "ready", board: parseWorkboard({ ...FIXTURE, stale: true }) }} />)
    expect(screen.getByTestId("workboard-stale")).toBeTruthy()
  })
})
