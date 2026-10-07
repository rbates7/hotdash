import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RESPONSIVE_TABLE_SLOT, ResponsiveTable } from "@/components/responsive-table"

describe("ResponsiveTable", () => {
  it("wraps children in a scroll container by default", () => {
    render(
      <ResponsiveTable>
        <table aria-label="Deals">
          <tbody>
            <tr>
              <td>Aledo</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    const box = document.querySelector(`[data-slot="${RESPONSIVE_TABLE_SLOT}"]`)
    expect(box).toBeTruthy()
    expect(box).toHaveAttribute("data-layout", "scroll")
    expect(box?.className).toContain("overflow-x-auto")
    expect(screen.getByRole("table", { name: "Deals" })).toBeInTheDocument()
  })

  it("keeps the table for desktop and the stacked cards for compact when layout is stack", () => {
    render(
      <ResponsiveTable layout="stack" stacked={<p>Stacked cards</p>}>
        <table aria-label="Deals">
          <tbody>
            <tr>
              <td>Aledo</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    expect(screen.getByText("Stacked cards")).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Deals" })).toBeInTheDocument()
    const box = document.querySelector(`[data-slot="${RESPONSIVE_TABLE_SLOT}"]`)
    expect(box).toHaveAttribute("data-layout", "stack")
    expect(box?.className).not.toContain("overflow-x-auto")
  })
})
