import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { STATUS_CONFIG, STATUS_ORDER, type IssueStatus } from "@/lib/issues"
import { StatusSwitcher } from "@/components/agent-workplace/status-switcher"

const COUNTS: Record<IssueStatus, number> = {
  todo: 3,
  in_progress: 3,
  in_review: 2,
  done: 3,
  blocked: 2,
}

describe("StatusSwitcher", () => {
  it("renders every board status with its count", () => {
    render(<StatusSwitcher value="todo" counts={COUNTS} onChange={vi.fn()} />)
    const group = screen.getByRole("group", { name: "Board status" })
    expect(group).toBeInTheDocument()
    for (const status of STATUS_ORDER) {
      expect(
        screen.getByRole("button", { name: new RegExp(STATUS_CONFIG[status].label) })
      ).toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: /To Do/ }).textContent).toMatch(/3/)
    expect(screen.getByRole("button", { name: /Blocked/ }).textContent).toMatch(/2/)
  })

  it("marks the selected status and reports the next one", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatusSwitcher value="todo" counts={COUNTS} onChange={onChange} />)
    expect(screen.getByRole("button", { name: /To Do/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: /In Progress/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await user.click(screen.getByRole("button", { name: /In Progress/ }))
    expect(onChange).toHaveBeenCalledWith("in_progress")
  })
})
