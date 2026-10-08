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

function tableBox() {
  return document.querySelector(`[data-slot="${RESPONSIVE_TABLE_SLOT}"]`)
}

describe("ResponsiveTable", () => {
  it("scroll (default): keeps columns inside a horizontal scroller", () => {
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
    const box = tableBox()
    expect(box).toBeTruthy()
    expect(box).toHaveAttribute("data-layout", "scroll")
    expect(box?.className).toContain("overflow-x-auto")
    expect(screen.getByRole("table", { name: "Deals" })).toBeInTheDocument()
  })

  it("phone stack: shows stacked cards below md and hides the overflow scroller", () => {
    render(
      <ResponsiveTable
        layout="stack"
        stacked={
          <>
            <RowCollapse title="Westfield" meta={[{ label: "Type", value: "Outreach" }]} />
            <RowCollapse title="Aledo" />
          </>
        }
      >
        <table aria-label="Deals">
          <tbody>
            <tr>
              <td>Aledo</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    expect(screen.getByText("Westfield")).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Deals" })).toBeInTheDocument()
    const box = tableBox()
    expect(box).toHaveAttribute("data-layout", "stack")
    expect(box?.className).not.toContain("overflow-x-auto")
    const stack = box?.querySelector(".md\\:hidden")
    expect(stack).toHaveAttribute("role", "list")
    expect(stack?.querySelectorAll('[role="listitem"]')).toHaveLength(2)
  })

  it("tablet/desktop (md+): stack layout keeps the table for the md:block pane", () => {
    render(
      <ResponsiveTable layout="stack" stacked={<p>Stacked cards</p>}>
        <table aria-label="Clinics">
          <tbody>
            <tr>
              <td>Westfield</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    const box = tableBox()
    expect(box?.querySelector(".hidden.md\\:block")).toBeTruthy()
    expect(screen.getByRole("table", { name: "Clinics" })).toBeInTheDocument()
  })

  it("stack without stacked falls back to horizontal scroll", () => {
    render(
      <ResponsiveTable layout="stack">
        <table aria-label="Expenses">
          <tbody>
            <tr>
              <td>Payroll</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>
    )
    const box = tableBox()
    expect(box).toHaveAttribute("data-layout", "stack")
    expect(box?.className).toContain("overflow-x-auto")
    expect(screen.getByRole("table", { name: "Expenses" })).toBeInTheDocument()
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
    const box = tableBox()
    expect(box).toHaveAttribute("data-pin-first", "true")
    expect(box?.className).toContain("sticky")
  })
})

describe("RowCollapse", () => {
  it("renders title, status, labelled meta list, sample tag, and chevron", () => {
    render(
      <RowCollapse
        title="Staff seats invite fails on the iPad"
        status={<span>Open</span>}
        meta={[
          { label: "Case", value: "#1 · Marcus Hale · Westfield HS" },
          { label: "Priority", value: "High · 2h ago" },
          { label: "Owner", value: "Dana" },
        ]}
        sample
      />
    )
    const row = document.querySelector(`[data-slot="${ROW_COLLAPSE_SLOT}"]`)
    expect(row).toHaveAttribute("data-state", "default")
    expect(screen.getByText("Staff seats invite fails on the iPad")).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("Case:")).toBeInTheDocument()
    expect(screen.getByText("#1 · Marcus Hale · Westfield HS")).toBeInTheDocument()
    expect(screen.getByText("Dana")).toBeInTheDocument()
    expect(screen.getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
  })

  it("uses spans instead of div or p inside a clickable row", () => {
    render(
      <RowCollapse
        title="Overdue clinic"
        status={<span>Open</span>}
        meta={[{ label: "Type", value: "Outreach" }]}
        onClick={() => undefined}
      />
    )
    const row = screen.getByRole("button", { name: /Overdue clinic/ })
    expect(row.querySelectorAll("div, p, ul, ol, li")).toHaveLength(0)
    expect(row.querySelectorAll("span").length).toBeGreaterThan(0)
    expect(row).toHaveAccessibleName(/Type/)
    expect(row).toHaveAccessibleName(/Outreach/)
  })

  it("marks a loading row with aria-busy and a Loading name, not an empty button", () => {
    render(<RowCollapse title="Soon" loading onClick={() => undefined} />)
    const row = screen.getByRole("button", { name: "Loading" })
    expect(row).toHaveAttribute("aria-busy", "true")
    expect(row).toHaveAttribute("data-state", "loading")
    expect(row).not.toHaveTextContent(/^$/)
  })

  it("marks attention rows and fires onClick", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <RowCollapse
        title="Overdue clinic"
        attention
        meta={[
          { label: "Type", value: "Outreach" },
          { label: "Urgency", value: "High · 2h ago" },
        ]}
        onClick={onClick}
      />
    )
    const row = screen.getByRole("button", { name: /Overdue clinic/ })
    expect(row).toHaveAttribute("data-state", "attention")
    await user.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
