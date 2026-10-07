import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import {
  RESPONSIVE_TABLE_SLOT,
  ROW_COLLAPSE_SLOT,
  ResponsiveTable,
  RowCollapse,
} from "@/components/responsive-table"

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

  it("pins the first column for dense numeric tables", () => {
    render(
      <ResponsiveTable pinFirst>
        <table aria-label="Expenses">
          <tbody>
            <tr>
              <td>Payroll</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    const box = document.querySelector(`[data-slot="${RESPONSIVE_TABLE_SLOT}"]`)
    expect(box).toHaveAttribute("data-pin-first", "true")
    expect(box?.className).toContain("sticky")
  })

  it("keeps the table from md up and the stacked cards on phone when layout is stack", () => {
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

describe("RowCollapse", () => {
  it("renders title, status, two meta lines, sample tag, and chevron", () => {
    render(
      <RowCollapse
        title="Staff seats invite fails on the iPad"
        status={<span>Open</span>}
        meta={["#1 · Marcus Hale · Westfield HS", "High · 2h ago"]}
        sample
      />
    )
    const row = document.querySelector(`[data-slot="${ROW_COLLAPSE_SLOT}"]`)
    expect(row).toHaveAttribute("data-state", "default")
    expect(screen.getByText("Staff seats invite fails on the iPad")).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("#1 · Marcus Hale · Westfield HS")).toBeInTheDocument()
    expect(screen.getByText("High · 2h ago")).toBeInTheDocument()
    expect(screen.getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
  })

  it("marks attention rows and fires onClick", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <RowCollapse
        title="Overdue clinic"
        attention
        meta={["Outreach", "High · 2h ago"]}
        onClick={onClick}
      />
    )
    const row = screen.getByRole("button", { name: /Overdue clinic/ })
    expect(row).toHaveAttribute("data-state", "attention")
    await user.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
