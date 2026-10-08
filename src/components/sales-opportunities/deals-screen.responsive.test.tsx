import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
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
    expect(pruitt).toHaveTextContent("Collect the PO from the booster club · 25 Aug 2026 · Overdue 2 days")
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
