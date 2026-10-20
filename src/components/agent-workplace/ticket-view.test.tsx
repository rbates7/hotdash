import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { storeFounderBoard } from "@/test/workplace"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { BUG_TOGGLE, TicketView } from "@/components/agent-workplace/ticket-view"

function renderTicket(key = "CHLK-904") {
  const onClose = vi.fn()
  storeFounderBoard(new Date(FIXED_NOW_MS))
  render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <TicketView issueKey={key} onClose={onClose} />
    </IssuesProvider>
  )
  return { onClose }
}

describe("TicketView properties rail", () => {
  it("lets the founder change priority", async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.click(screen.getByRole("button", { name: "Priority: Urgent" }))
    await user.click(await screen.findByRole("button", { name: "Low" }))

    expect(screen.getByRole("button", { name: "Priority: Low" })).toBeInTheDocument()
  })

  it("lets the founder set and clear a project", async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.click(screen.getByRole("button", { name: "Project: No project" }))
    await user.click(await screen.findByRole("button", { name: "Billing" }))
    expect(screen.getByRole("button", { name: "Project: Billing" })).toBeInTheDocument()

    // The picker stays open after a choice, like the status picker does.
    await user.click(screen.getByRole("button", { name: "No project" }))
    expect(screen.getByRole("button", { name: "Project: No project" })).toBeInTheDocument()
  })

  it("does not offer inert property affordances", () => {
    renderTicket()
    expect(screen.queryByText("Add property")).not.toBeInTheDocument()
    expect(screen.queryByText("Add sub-issues")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pin issue" })).toBeDisabled()
  })

  it("tags and untags a ticket as a bug, and the chip follows the labels", async () => {
    const user = userEvent.setup()
    // CHLK-902 is not a bug.
    renderTicket("CHLK-902")
    expect(screen.queryByTestId("bug-tag")).not.toBeInTheDocument()

    const toggle = screen.getByRole("button", { name: BUG_TOGGLE.tag })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await user.click(toggle)

    const untag = screen.getByRole("button", { name: BUG_TOGGLE.untag })
    expect(untag).toHaveAttribute("aria-pressed", "true")
    // A user-tagged bug has no crash label, so it reads as coach-reported.
    expect(screen.getByTestId("bug-tag")).toHaveTextContent("Bug · Coach-reported")
    expect(screen.getByTestId("bug-tag")).toHaveAttribute("data-source", "coach")

    await user.click(untag)
    expect(screen.getByRole("button", { name: BUG_TOGGLE.tag })).toBeInTheDocument()
    expect(screen.queryByTestId("bug-tag")).not.toBeInTheDocument()
  })

  it("a crash-labelled bug reads as Bug · Crash", () => {
    renderTicket("CHLK-919")
    expect(screen.getByTestId("bug-tag")).toHaveTextContent("Bug · Crash")
    expect(screen.getByRole("button", { name: BUG_TOGGLE.untag })).toBeInTheDocument()
  })

  it("shows a way back when the key is unknown", async () => {
    const user = userEvent.setup()
    const { onClose } = renderTicket("CHLK-1999")
    await user.click(screen.getByRole("button", { name: /back to the board/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe("TicketView never opens an old demo ticket", () => {
  it("a demo key in an old saved copy is not found, even though the copy held it", async () => {
    const { buildIssues, buildSprints } = await import("@/lib/issues-fixture")
    const now = new Date(FIXED_NOW_MS)
    window.localStorage.setItem(
      "hotdash.agent-workplace.v2",
      JSON.stringify({ issues: buildIssues(now), sprints: buildSprints(now), nextKey: 422 })
    )
    render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <TicketView issueKey="CHLK-419" onClose={vi.fn()} />
      </IssuesProvider>
    )
    expect(screen.getByText("Issue CHLK-419 not found")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
  })
})
