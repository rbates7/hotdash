import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { founderBoard, storeFounderBoard } from "@/test/workplace"
import { IssuesProvider, STORAGE_KEY, useIssues, type ClearScope } from "@/components/agent-workplace/issues-store"
import { WORKPLACE_RESET } from "@/components/agent-workplace/responsive"
import {
  CLEAR_SCOPE_DESCRIPTION,
  CLEAR_SCOPE_EMPTY_HINT,
  WorkplacePersistenceNote,
} from "@/components/agent-workplace/workplace-persistence-note"
import { CLEAR_COPY } from "@/components/persistence-note"

function Keys() {
  return <span data-testid="keys">{useIssues().issues.map((i) => i.key).join(",")}</span>
}

function renderNote({ scope = "workplace" as ClearScope, resetClassName }: { scope?: ClearScope; resetClassName?: string } = {}) {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <WorkplacePersistenceNote scope={scope} resetClassName={resetClassName} />
      <Keys />
    </IssuesProvider>
  )
}

const clearButton = () => screen.getByRole("button", { name: CLEAR_COPY.button })

describe("WorkplacePersistenceNote", () => {
  it("is Clear my entries, never Reset: the board has no sample rows to bring back", () => {
    renderNote()
    expect(clearButton()).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
  })

  it("does not grow Clear unless the screen passes resetClassName", () => {
    renderNote()
    expect(clearButton().className.split(/\s+/)).not.toContain("max-xl:h-11!")
  })

  it("applies resetClassName when the screen passes it", () => {
    renderNote({ resetClassName: WORKPLACE_RESET })
    expect(clearButton().className.split(/\s+/)).toContain("max-xl:h-11!")
  })

  it("is off with nothing saved", () => {
    renderNote()
    expect(clearButton()).toHaveAttribute("aria-disabled", "true")
    expect(clearButton()).toHaveAccessibleDescription(CLEAR_COPY.disabledHint)
  })

  it("Agent Workplace's Clear deletes the board's tickets and sprints and keeps the founder's bugs (item 9)", async () => {
    const user = userEvent.setup()
    const board = storeFounderBoard(new Date(FIXED_NOW_MS))
    const bugs = board.issues.filter((i) => i.labels.includes("bug")).map((i) => i.key)
    renderNote()
    await user.click(clearButton())
    expect(screen.getByText(CLEAR_SCOPE_DESCRIPTION.workplace)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: CLEAR_COPY.confirm }))
    expect(screen.getByTestId("keys")).toHaveTextContent(bugs.join(","))
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).issues).toHaveLength(bugs.length)
    // Nothing of the Workplace's own is left, so its Clear turns off and says why.
    expect(clearButton()).toHaveAttribute("aria-disabled", "true")
    expect(clearButton()).toHaveAccessibleDescription(CLEAR_SCOPE_EMPTY_HINT.workplace)
  })

  it("Bugs' Clear deletes only the bug tickets", async () => {
    const user = userEvent.setup()
    const board = storeFounderBoard(new Date(FIXED_NOW_MS))
    const rest = board.issues.filter((i) => !i.labels.includes("bug")).map((i) => i.key)
    renderNote({ scope: "bugs" })
    await user.click(clearButton())
    expect(screen.getByText(CLEAR_SCOPE_DESCRIPTION.bugs)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: CLEAR_COPY.confirm }))
    expect(screen.getByTestId("keys")).toHaveTextContent(rest.join(","))
  })

  it("on Bugs, is off when the saved board has no bug tickets", () => {
    const board = founderBoard(new Date(FIXED_NOW_MS))
    storeFounderBoard(new Date(FIXED_NOW_MS), { ...board, issues: board.issues.filter((i) => !i.labels.includes("bug")) })
    act(() => {
      renderNote({ scope: "bugs" })
    })
    expect(clearButton()).toHaveAttribute("aria-disabled", "true")
    expect(clearButton()).toHaveAccessibleDescription(CLEAR_SCOPE_EMPTY_HINT.bugs)
  })
})
