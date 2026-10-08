import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FilterChips } from "@/components/agent-workplace/issues-board"

describe("FilterChips", () => {
  it("B3: wraps like develop instead of clipping sideways", () => {
    render(<FilterChips value="all" onChange={vi.fn()} />)
    expect(screen.getByRole("group", { name: "Issue filters" })).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "gap-1.5"
    )
    expect(screen.getByRole("group", { name: "Issue filters" }).className).not.toMatch(
      /overflow-x-/
    )
  })
})
