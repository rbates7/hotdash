import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { WORKPLACE_RESET } from "@/components/agent-workplace/responsive"
import { WorkplacePersistenceNote } from "@/components/agent-workplace/workplace-persistence-note"

function renderNote(resetClassName?: string) {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <WorkplacePersistenceNote resetClassName={resetClassName} />
    </IssuesProvider>
  )
}

describe("WorkplacePersistenceNote", () => {
  it("does not grow Reset unless the screen passes resetClassName", () => {
    renderNote()
    const tokens = screen.getByRole("button", { name: "Reset" }).className.split(/\s+/)
    expect(tokens).not.toContain("max-xl:h-11!")
  })

  it("applies resetClassName when the screen passes it", () => {
    renderNote(WORKPLACE_RESET)
    const tokens = screen.getByRole("button", { name: "Reset" }).className.split(/\s+/)
    expect(tokens).toContain("max-xl:h-11!")
  })
})
