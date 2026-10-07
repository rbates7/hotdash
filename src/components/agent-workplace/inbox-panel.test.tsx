import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
} from "@/components/agent-workplace/issues-store"
import { InboxPanel } from "@/components/agent-workplace/inbox-panel"

function renderInbox() {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <InboxPanel onOpenIssue={vi.fn()} />
    </IssuesProvider>
  )
}

describe("InboxPanel", () => {
  it("lists the seed rows, dismissed digest included", () => {
    renderInbox()
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.getByText("Daily standup summary")).toBeInTheDocument()
  })

  it("drops a row once its ticket is done on the board", async () => {
    const seed = initialState(FIXED_NOW)
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...seed,
        issues: seed.issues.map((i) =>
          i.key === "CHLK-412" ? { ...i, status: "done" } : i
        ),
      })
    )
    renderInbox()
    expect(await screen.findByText("Agent finished — needs review")).toBeInTheDocument()
    expect(screen.queryByText("Agent blocked")).not.toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("keeps the ticketless digest even when every ticket is done", async () => {
    const seed = initialState(FIXED_NOW)
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...seed,
        issues: seed.issues.map((i) => ({ ...i, status: "done" })),
      })
    )
    renderInbox()
    expect(await screen.findByText("Daily standup summary")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })
})
