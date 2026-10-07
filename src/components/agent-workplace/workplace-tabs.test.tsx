import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { navigation } from "@/test/setup"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { WorkplaceTabs } from "@/components/agent-workplace/workplace-tabs"

function renderTabs(search = "") {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
  return render(
    <IssuesProvider>
      <WorkplaceTabs />
    </IssuesProvider>
  )
}

describe("WorkplaceTabs", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams()
  })

  it("renders the locked tab set with Issues first", () => {
    renderTabs()
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent)
    expect(tabs).toEqual([
      "Issues",
      "Backlog",
      "Agents",
      "Chat",
      "Autopilots",
      "Inbox",
    ])
    expect(screen.getByRole("tab", { name: "Issues" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("shows five columns, the agents-working pill and the four filters", () => {
    renderTabs()
    for (const col of ["To Do", "In Progress", "In Review", "Done", "Blocked"]) {
      expect(screen.getByRole("region", { name: col })).toBeInTheDocument()
    }
    expect(screen.getByText("3 agents working")).toBeInTheDocument()
    const filters = screen.getByRole("group", { name: "Issue filters" })
    expect(within(filters).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All",
      "Members",
      "Agents",
      "New",
    ])
  })

  it("filters to unassigned issues with New", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("button", { name: "New" }))
    const todo = screen.getByRole("region", { name: "To Do" })
    expect(within(todo).getByText("Snap-to-hash on new formations")).toBeInTheDocument()
    expect(within(todo).queryByText("Copy-link expires after 7 days")).not.toBeInTheDocument()
  })

  it("pushes the ticket into the URL when a card is opened", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByText("Undo stack for iPad canvas"))
    expect(navigation.push).toHaveBeenCalledWith("?issue=CHLK-404", { scroll: false })
  })

  it("opens the ticket view from the URL", () => {
    renderTabs("issue=CHLK-404")
    expect(screen.getByRole("heading", { level: 1, name: "Undo stack for iPad canvas" })).toBeInTheDocument()
  })

  it("roster shows each agent with status and current task", () => {
    renderTabs("tab=agents")
    const card = screen.getByRole("article", { name: "Grok-1" })
    expect(within(card).getByText("Working")).toBeInTheDocument()
    expect(within(card).getByText("Undo stack for iPad canvas")).toBeInTheDocument()
    expect(within(card).getByText("CHLK-404")).toBeInTheDocument()
  })

  it("chat is a door, not a thread", () => {
    renderTabs("tab=chat")
    const panel = screen.getByRole("tabpanel")
    expect(panel.textContent).toMatch(/door/i)
    expect(panel.textContent).not.toMatch(/unified/i)
    expect(panel.textContent).not.toMatch(/thread/i)
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(panel).queryByRole("button", { name: /send/i })).not.toBeInTheDocument()
  })

  it("inbox rows with a ticket open it", async () => {
    const user = userEvent.setup()
    renderTabs("tab=inbox")
    await user.click(screen.getByText("Agent blocked"))
    expect(navigation.push).toHaveBeenCalledWith("?tab=inbox&issue=CHLK-412", { scroll: false })
  })

  it("autopilots lists the three assumed schedules", () => {
    renderTabs("tab=autopilots")
    expect(screen.getAllByRole("row")).toHaveLength(4) // header + 3
    expect(screen.getByText("Weekly bug audit")).toBeInTheDocument()
  })
})
