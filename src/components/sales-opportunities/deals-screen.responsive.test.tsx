import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { DealsPersistenceNote } from "@/components/sales-opportunities/deals-persistence-note"
import { DealsScreen } from "@/components/sales-opportunities/deals-screen"
import { DealsProvider } from "@/components/sales-opportunities/deals-store"
import { FIXED_NOW_MS } from "@/test/clock"

beforeAll(() => {
  // Base UI menus measure their anchors; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

// jsdom applies no CSS, so the phone cards (md:hidden), the tablet ellipsis
// (md:max-xl) and the desktop icons (xl) are all in the tree at once; each
// test scopes to the layout it is about.
function renderScreen() {
  return render(
    <DealsProvider nowMs={FIXED_NOW_MS}>
      <section aria-label="Sales Opportunities">
        <DealsScreen />
      </section>
    </DealsProvider>
  )
}

const region = () => screen.getByRole("region", { name: "Deals" })
const list = () => within(region()).getByRole("list")
/** A phone card: the RowCollapse button whose name starts with the deal's Who. */
const card = (who: string) =>
  within(list()).getByRole("button", { name: new RegExp(`^${who}`) })
const table = () => within(region()).getByRole("table", { name: "Deals" })
const row = (who: RegExp) => within(table()).getByRole("row", { name: who })

describe("phone (<768): RowCollapse cards", () => {
  it("maps Who / Stage / Org · What · Value / Next step · due, in the table's order", () => {
    renderScreen()
    const cards = within(list()).getAllByRole("listitem")
    expect(cards).toHaveLength(6)
    expect(cards.map((c) => c.querySelector(`[data-slot='${ROW_COLLAPSE_SLOT}']`))).not.toContain(null)

    const pruitt = card("Coach Lonnie Pruitt")
    expect(pruitt).toHaveTextContent("Verbal")
    expect(pruitt).toHaveTextContent("Cedar Creek HS (6A) · Staff seats × 5 · $1,500")
    // The card drops the year ("25 Aug", Deke 9:339) so "Overdue 2 days" fits; the sheet keeps it.
    expect(pruitt).toHaveTextContent("Collect the PO from the booster club · 25 Aug · Overdue 2 days")
    expect(pruitt).not.toHaveTextContent("2026")
    expect(within(pruitt).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    // Meta lines are labelled for screen readers.
    expect(within(pruitt).getByText("Deal:", { exact: false })).toHaveClass("sr-only")
    expect(within(pruitt).getByText("Next step:", { exact: false })).toHaveClass("sr-only")
  })

  it("flags overdue cards as attention, in the text-safe danger token", () => {
    renderScreen()
    const pruitt = card("Coach Lonnie Pruitt")
    expect(pruitt).toHaveAttribute("data-state", "attention")
    expect(pruitt.className).toContain("[&_.text-destructive]:text-danger-text")
    expect(card("Coach Reggie Okafor")).toHaveAttribute("data-state", "attention")
    expect(card("Coach Darnell Whitaker")).toHaveAttribute("data-state", "default")
  })

  it("says a missing value and a missing date in words", () => {
    renderScreen()
    const hale = card("Coach Tommy Hale")
    expect(hale).toHaveTextContent("Harlan County HS · Staff seats × 4 · Value not known yet")
    expect(hale).toHaveTextContent("Hear back after their spring staff meeting · No date")
    expect(hale).toHaveAttribute("data-state", "default")
  })
})

describe("phone (<768): the row-actions bottom sheet", () => {
  async function openSheet(who: string) {
    const user = userEvent.setup()
    renderScreen()
    await user.click(card(who))
    const sheet = await screen.findByRole("dialog", { name: who })
    return { user, sheet }
  }

  it("opens from a card, titled by Who, with the summary and the four actions", async () => {
    const { sheet } = await openSheet("Coach Lonnie Pruitt")
    expect(sheet).toHaveTextContent("Verbal")
    expect(sheet).toHaveTextContent("Cedar Creek HS (6A) · Staff seats × 5 · $1,500")
    expect(sheet).toHaveTextContent(/Owner Skye · Last touch /)
    expect(within(sheet).getByText(/Collect the PO from the booster club · 25 Aug 2026 · Overdue 2 days/).closest("p")).toHaveAttribute(
      "data-overdue",
      "true"
    )
    const actions = within(within(sheet).getByRole("group", { name: "Deal actions" })).getAllByRole("button")
    expect(actions.map((b) => b.textContent)).toEqual([
      "Move stageVerbal",
      "Next step done",
      "Edit deal",
      "Delete deal",
    ])
  })

  it("Move stage uses the stage menu", async () => {
    const { user, sheet } = await openSheet("Coach Lonnie Pruitt")
    await user.click(within(sheet).getByRole("button", { name: /Move stage/ }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitemradio", { name: "Verbal" })).toHaveAttribute("aria-checked", "true")
    await user.click(within(menu).getByRole("menuitemradio", { name: "Proposal" }))
    await waitFor(() => expect(within(sheet).getByRole("button", { name: /Move stage/ })).toHaveTextContent("Proposal"))
  })

  it("Next step done opens the existing Next step done dialog", async () => {
    const { user, sheet } = await openSheet("Coach Reggie Okafor")
    await user.click(within(sheet).getByRole("button", { name: "Next step done" }))
    const dialog = await screen.findByRole("dialog", { name: "Next step done" })
    expect(dialog).toHaveTextContent("“Follow up on the trial seats” is done for Coach Reggie Okafor")
    expect(screen.queryByRole("dialog", { name: "Coach Reggie Okafor" })).not.toBeInTheDocument()
  })

  it("Edit deal opens the existing Edit dialog, prefilled", async () => {
    const { user, sheet } = await openSheet("Coach Tommy Hale")
    await user.click(within(sheet).getByRole("button", { name: "Edit deal" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit deal" })
    expect(within(dialog).getByRole("textbox", { name: "Who" })).toHaveValue("Coach Tommy Hale")
    await user.type(within(dialog).getByRole("textbox", { name: "Value" }), "1200")
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit deal" })).not.toBeInTheDocument())
    expect(card("Coach Tommy Hale")).toHaveTextContent("$1,200")
  })

  it("Delete deal opens the existing confirm and deletes", async () => {
    const { user, sheet } = await openSheet("Dana Alvarez")
    await user.click(within(sheet).getByRole("button", { name: "Delete deal" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete this deal?" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(within(list()).queryByRole("button", { name: /^Dana Alvarez/ })).not.toBeInTheDocument())
    expect(within(list()).getAllByRole("listitem")).toHaveLength(5)
  })

  it("Escape closes the sheet", async () => {
    const { user } = await openSheet("Coach Lonnie Pruitt")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Coach Lonnie Pruitt" })).not.toBeInTheDocument())
  })

  it("has the stock × (44px below 1280), which closes it and returns focus to the card", async () => {
    const { user, sheet } = await openSheet("Coach Lonnie Pruitt")
    const close = within(sheet).getByRole("button", { name: "Close" })
    expect(close).toHaveAttribute("data-slot", "sheet-close")
    // The size rule lives on the sheet so the stock × keeps its Nova markup.
    expect(sheet.className).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    await user.click(close)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Coach Lonnie Pruitt" })).not.toBeInTheDocument())
    await waitFor(() => expect(card("Coach Lonnie Pruitt")).toHaveFocus())
  })

  it("stage menu rows are 44px below 1280", async () => {
    const { user, sheet } = await openSheet("Coach Lonnie Pruitt")
    await user.click(within(sheet).getByRole("button", { name: /Move stage/ }))
    const menu = await screen.findByRole("menu")
    for (const item of within(menu).getAllByRole("menuitemradio")) expect(item).toHaveClass("max-xl:min-h-11")
  })

  it("after Delete from the sheet, focus moves to the card now in its place", async () => {
    const user = userEvent.setup()
    renderScreen()
    const buttons = within(list()).getAllByRole("button")
    const next = buttons[buttons.indexOf(card("Coach Lonnie Pruitt")) + 1]
    expect(next).toBeDefined()
    await user.click(card("Coach Lonnie Pruitt"))
    const sheet = await screen.findByRole("dialog", { name: "Coach Lonnie Pruitt" })
    await user.click(within(sheet).getByRole("button", { name: "Delete deal" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete this deal?" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(within(list()).queryByRole("button", { name: /^Coach Lonnie Pruitt/ })).not.toBeInTheDocument())
    await waitFor(() => expect(next).toHaveFocus())
  })

  it("the dialogs it opens are touch-sized below 1280: fields, footer buttons and ×", async () => {
    const { user, sheet } = await openSheet("Coach Lonnie Pruitt")
    await user.click(within(sheet).getByRole("button", { name: "Edit deal" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit deal" })
    expect(dialog.className).toContain("max-xl:[&>[data-slot=dialog-close]]:size-11!")
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveAttribute("data-slot", "dialog-close")
    for (const name of ["Who", "School / org", "What they're buying", "Value", "Next step"]) {
      expect(within(dialog).getByRole("textbox", { name })).toHaveClass("max-xl:h-11!")
    }
    expect(within(dialog).getByLabelText("Due date")).toHaveClass("max-xl:h-11!")
    for (const name of ["Stage", "Owner"]) expect(within(dialog).getByRole("combobox", { name })).toHaveClass("max-xl:h-11!")
    for (const name of ["Cancel", "Save changes"]) {
      expect(within(dialog).getByRole("button", { name })).toHaveClass("max-xl:h-11!")
    }
  })
})

describe("persistence note", () => {
  it("passes the 44px-below-1280 Reset through the shared resetClassName", () => {
    render(
      <DealsProvider nowMs={FIXED_NOW_MS}>
        <DealsPersistenceNote />
      </DealsProvider>
    )
    const reset = screen.getByRole("button", { name: /Reset/ })
    expect(reset).toHaveClass("max-xl:h-11!", "max-xl:min-w-11!")
    // The note's root keeps the shared classes (no wrapper, no className).
    expect(reset.parentElement).toHaveClass("text-micro", "inline-flex", "items-center", "gap-1.5")
  })
})

describe("filter: the picked view reads at every width", () => {
  it("pressed is solid primary (no breakpoint), unpressed stays Nova's", () => {
    renderScreen()
    const group = within(region()).getByRole("group", { name: "Show deals" })
    const pressed = within(group).getByRole("button", { pressed: true })
    expect(pressed).toHaveTextContent("Open")
    for (const b of within(group).getAllByRole("button")) {
      expect(b).toHaveClass("aria-pressed:bg-primary!", "aria-pressed:text-primary-foreground!")
    }
  })
})

describe("tablet (768–1279): the row's ellipsis menu", () => {
  it("lists Next step done / Edit deal / Delete deal and opens the existing dialogs", async () => {
    const user = userEvent.setup()
    renderScreen()
    const more = within(row(/Pruitt/)).getByRole("button", { name: "More actions for Coach Lonnie Pruitt" })
    await user.click(more)
    let menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Next step done",
      "Edit deal",
      "Delete deal",
    ])
    await user.click(within(menu).getByRole("menuitem", { name: "Edit deal" }))
    const edit = await screen.findByRole("dialog", { name: "Edit deal" })
    expect(within(edit).getByRole("textbox", { name: "Who" })).toHaveValue("Coach Lonnie Pruitt")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit deal" })).not.toBeInTheDocument())

    await user.click(within(row(/Pruitt/)).getByRole("button", { name: "More actions for Coach Lonnie Pruitt" }))
    menu = await screen.findByRole("menu")
    await user.click(within(menu).getByRole("menuitem", { name: "Next step done" }))
    expect(await screen.findByRole("dialog", { name: "Next step done" })).toHaveTextContent("Coach Lonnie Pruitt")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Next step done" })).not.toBeInTheDocument())

    await user.click(within(row(/Pruitt/)).getByRole("button", { name: "More actions for Coach Lonnie Pruitt" }))
    menu = await screen.findByRole("menu")
    await user.click(within(menu).getByRole("menuitem", { name: "Delete deal" }))
    const del = await screen.findByRole("dialog", { name: "Delete this deal?" })
    await user.click(within(del).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(within(table()).queryByRole("row", { name: /Pruitt/ })).not.toBeInTheDocument())
  })

  it("folds Owner · Last touch under Who and What under Value", () => {
    renderScreen()
    const cells = within(row(/Treadwell/)).getAllByRole("cell")
    expect(within(cells[0]).getByText("Rashad · Mon, Aug 24")).toHaveClass("hidden", "md:max-xl:block")
    expect(within(cells[2]).getByText("Program license")).toHaveClass("hidden", "md:max-xl:block")
    // The folded columns hide on tablet only.
    for (const i of [1, 5, 6]) expect(cells[i]).toHaveClass("md:max-xl:hidden")
  })
})
