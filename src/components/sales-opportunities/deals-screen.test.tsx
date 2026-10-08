import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { CAPS } from "@/lib/sales-opportunities"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { DealsPersistenceNote } from "@/components/sales-opportunities/deals-persistence-note"
import { DealsScreen } from "@/components/sales-opportunities/deals-screen"
import {
  DealsProvider,
  initialState,
  reducer,
  saveState,
} from "@/components/sales-opportunities/deals-store"
import { FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"

beforeAll(() => {
  // Base UI menus and selects measure their anchors; jsdom has no layout or
  // ResizeObserver, so give them an inert one. Positioning is not under test.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

function Screen({ nowMs = FIXED_NOW_MS }: { nowMs?: number }) {
  return (
    <DealsProvider nowMs={nowMs}>
      <section aria-label="Sales Opportunities">
        <header>
          <DealsPersistenceNote />
        </header>
        <DealsScreen />
      </section>
    </DealsProvider>
  )
}

const renderScreen = (nowMs?: number) => render(<Screen nowMs={nowMs} />)

const region = () => screen.getByRole("region", { name: "Deals" })
const table = () => within(region()).getByRole("table", { name: "Deals" })
const rows = () => within(table()).getAllByRole("row").slice(1)
const row = (who: RegExp) => within(table()).getByRole("row", { name: who })
const filter = (name: string) =>
  within(within(region()).getByRole("group", { name: "Show deals" })).getByRole("button", { name })

describe("DealsScreen", () => {
  it("renders skeletons on the server, never the seed, until localStorage has been read", () => {
    const html = renderToStaticMarkup(<Screen />)
    expect(html).toContain('aria-label="Loading saved deals"')
    expect(html).not.toContain("Whitaker")
    expect(html).not.toContain("Sample data")
    expect(html).toContain("Loading saved edits…")
  })

  it("is hydrated before paint and shows the six open deals, soonest next step first, overdue flagged", () => {
    renderScreen()
    expect(screen.queryByRole("status", { name: "Loading saved deals" })).not.toBeInTheDocument()
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Who",
      "What they're buying",
      "Value",
      "Stage",
      "Next step",
      "Owner",
      "Last touch",
      "Actions",
    ])
    expect(within(table()).getByRole("columnheader", { name: "Next step" })).toHaveAttribute("aria-sort", "ascending")
    const who = rows().map((r) => within(r).getAllByRole("cell")[0].querySelector("p")!.textContent)
    expect(who).toEqual([
      "Coach Lonnie Pruitt",
      "Coach Reggie Okafor",
      "Coach Darnell Whitaker",
      "Coach Marcus Treadwell",
      "Dana Alvarez",
      "Coach Tommy Hale",
    ])
    expect(rows().filter((r) => r.getAttribute("data-overdue") === "true")).toHaveLength(2)
    expect(within(row(/Pruitt/)).getByText("Overdue 2 days")).toBeInTheDocument()
    expect(within(row(/Pruitt/)).getByText("25 Aug 2026")).toBeInTheDocument()
    expect(within(row(/Okafor/)).getByText("Overdue 1 day")).toBeInTheDocument()
    expect(within(row(/Whitaker/)).getByText("Due in 2 days")).toBeInTheDocument()
    expect(within(row(/Hale/)).getByText("No date")).toBeInTheDocument()
    expect(within(region()).getByText("2 overdue")).toBeInTheDocument()
    expect(within(region()).getByRole("heading", { level: 2, name: "Open deals" })).toBeInTheDocument()
  })

  it("prints who, what, value, stage, owner and a Central-day last touch per row", () => {
    renderScreen()
    const r = row(/Treadwell/)
    expect(within(r).getByText("Red River A&M (FCS)")).toBeInTheDocument()
    // The What column; tablet also folds it under Value (CSS-hidden at xl, present in jsdom).
    expect(within(within(r).getAllByRole("cell")[1]).getByText("Program license")).toBeInTheDocument()
    expect(within(r).getByText("$12,000")).toBeInTheDocument()
    expect(within(r).getByRole("button", { name: "Stage: Talking" })).toBeInTheDocument()
    expect(within(r).getByText("Rashad")).toBeInTheDocument()
    expect(within(r).getByText("Mon, Aug 24")).toHaveAttribute("title", "24 Aug 2026, 12:00 PM CT")
    expect(within(row(/Hale/)).getByText("Value not known yet")).toBeInTheDocument()
    expect(within(row(/Whitaker/)).getByText("Yesterday")).toBeInTheDocument()
  })

  it("marks every seed row as sample data and the table strip too", () => {
    renderScreen()
    for (const r of rows()) {
      expect(within(r).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    }
    expect(within(region()).getByTestId("sample-data-strip")).toHaveTextContent(/Seed deals are invented/)
  })

  it("filters Open / Won / Lost / All", async () => {
    const user = userEvent.setup()
    renderScreen()
    expect(filter("Open")).toHaveAttribute("aria-pressed", "true")
    await user.click(filter("Won"))
    expect(rows()).toHaveLength(1)
    expect(row(/Castellano/)).toBeInTheDocument()
    expect(within(row(/Castellano/)).getByText("28 Aug 2026")).toBeInTheDocument()
    // Closed deals show the date alone, never "Overdue" or "Due in".
    expect(within(row(/Castellano/)).queryByText(/Due|Overdue/)).not.toBeInTheDocument()
    await user.click(filter("Lost"))
    expect(rows()).toHaveLength(1)
    expect(row(/Fitch/)).toBeInTheDocument()
    await user.click(filter("All"))
    expect(rows()).toHaveLength(8)
    expect(within(region()).getByRole("heading", { level: 2, name: "All deals" })).toBeInTheDocument()
    // Clicking the active filter again keeps it; the group is never empty.
    await user.click(filter("All"))
    expect(filter("All")).toHaveAttribute("aria-pressed", "true")
  })

  it("shows the disabled From Clinics slot", () => {
    renderScreen()
    const chip = within(region()).getByTestId("source-chip")
    expect(chip).toHaveTextContent("From Clinics (soon)")
    expect(chip).toHaveAttribute("aria-disabled", "true")
  })

  describe("Add deal", () => {
    it("puts maxLength on every field and disables submit until the required ones are filled", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(region()).getByRole("button", { name: "Add deal" }))
      const dialog = await screen.findByRole("dialog", { name: "Add deal" })
      const submit = within(dialog).getByRole("button", { name: "Add deal" })
      expect(submit).toBeDisabled()
      expect(within(dialog).getByRole("textbox", { name: "Who" })).toHaveAttribute("maxlength", String(CAPS.who))
      expect(within(dialog).getByRole("textbox", { name: "School / org" })).toHaveAttribute("maxlength", String(CAPS.org))
      expect(within(dialog).getByRole("textbox", { name: "What they're buying" })).toHaveAttribute("maxlength", String(CAPS.what))
      expect(within(dialog).getByRole("textbox", { name: "Value" })).toHaveAttribute("maxlength", String(CAPS.valueDigits))
      expect(within(dialog).getByRole("textbox", { name: "Next step" })).toHaveAttribute("maxlength", String(CAPS.nextStep))
      expect(within(dialog).getByLabelText("Due date")).toHaveAttribute("maxlength", "10")
      expect(within(dialog).getByRole("combobox", { name: "Stage" })).toHaveTextContent("Talking")
      expect(within(dialog).getByRole("combobox", { name: "Owner" })).toHaveTextContent("Trip")

      await user.type(within(dialog).getByRole("textbox", { name: "Who" }), "Coach Jordan Reyes")
      await user.type(within(dialog).getByRole("textbox", { name: "School / org" }), "Westlake HS")
      await user.type(within(dialog).getByRole("textbox", { name: "What they're buying" }), "Staff seats × 6")
      expect(submit).toBeDisabled()
      await user.type(within(dialog).getByRole("textbox", { name: "Next step" }), "Send the quote")
      expect(submit).toBeEnabled()
      // The value field keeps digits only, capped.
      await user.type(within(dialog).getByRole("textbox", { name: "Value" }), "1,8a00999999")
      expect(within(dialog).getByRole("textbox", { name: "Value" })).toHaveValue("1800999")
      await user.clear(within(dialog).getByRole("textbox", { name: "Value" }))
      await user.type(within(dialog).getByRole("textbox", { name: "Value" }), "1800")
      await user.click(submit)

      expect(screen.queryByRole("dialog", { name: "Add deal" })).not.toBeInTheDocument()
      const added = row(/Jordan Reyes/)
      expect(within(added).getByText("Westlake HS")).toBeInTheDocument()
      expect(within(added).getByText("$1,800")).toBeInTheDocument()
      expect(within(added).getByText("just now")).toBeInTheDocument()
      expect(within(added).getByText("No date")).toBeInTheDocument()
      // A deal you add is yours: no sample tag.
      expect(within(added).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
      expect(rows()).toHaveLength(7)
      expect(screen.getByTestId("persistence-note")).toHaveTextContent("Saved in this browser")
    })

    it("Cancel discards the draft", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(region()).getByRole("button", { name: "Add deal" }))
      let dialog = await screen.findByRole("dialog", { name: "Add deal" })
      await user.type(within(dialog).getByRole("textbox", { name: "Who" }), "Someone")
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
      expect(screen.queryByRole("dialog", { name: "Add deal" })).not.toBeInTheDocument()
      // The dialog lifts aria-hidden from the page once its close completes.
      await waitFor(() => expect(region()).toBeInTheDocument())
      await user.click(within(region()).getByRole("button", { name: "Add deal" }))
      dialog = await screen.findByRole("dialog", { name: "Add deal" })
      expect(within(dialog).getByRole("textbox", { name: "Who" })).toHaveValue("")
      await user.keyboard("{Escape}")
      await waitFor(() => expect(region()).toBeInTheDocument())
      expect(rows()).toHaveLength(6)
    })
  })

  describe("Edit deal", () => {
    it("opens prefilled, keeps Save disabled until something changes, and saves", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(row(/Hale/)).getByRole("button", { name: "Edit Coach Tommy Hale" }))
      const dialog = await screen.findByRole("dialog", { name: "Edit deal" })
      expect(within(dialog).getByRole("textbox", { name: "Who" })).toHaveValue("Coach Tommy Hale")
      expect(within(dialog).getByRole("textbox", { name: "Value" })).toHaveValue("")
      const save = within(dialog).getByRole("button", { name: "Save changes" })
      expect(save).toBeDisabled()
      await user.type(within(dialog).getByRole("textbox", { name: "Value" }), "1200")
      expect(save).toBeEnabled()
      await user.clear(within(dialog).getByRole("textbox", { name: "Value" }))
      expect(save).toBeDisabled()
      await user.type(within(dialog).getByRole("textbox", { name: "Value" }), "1200")
      await user.clear(within(dialog).getByLabelText("Due date"))
      await user.type(within(dialog).getByLabelText("Due date"), "2026-09-01")
      await user.click(save)
      expect(screen.queryByRole("dialog", { name: "Edit deal" })).not.toBeInTheDocument()
      const r = row(/Hale/)
      expect(within(r).getByText("$1,200")).toBeInTheDocument()
      expect(within(r).getByText("1 Sep 2026")).toBeInTheDocument()
      expect(within(r).getByText("Due in 5 days")).toBeInTheDocument()
      expect(within(r).getByText("just now")).toBeInTheDocument()
      // Still a seed row, still labelled.
      expect(within(r).getByTestId("sample-data-tag")).toBeInTheDocument()
    })
  })

  describe("stage", () => {
    it("changes inline from the stage pill; a closed deal leaves the Open view", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(row(/Pruitt/)).getByRole("button", { name: "Stage: Verbal" }))
      const menu = await screen.findByRole("menu")
      expect(within(menu).getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
        "Talking",
        "Proposal",
        "Verbal",
        "Closed-won",
        "Closed-lost",
      ])
      expect(within(menu).getByRole("menuitemradio", { name: "Verbal" })).toHaveAttribute("aria-checked", "true")
      await user.click(within(menu).getByRole("menuitemradio", { name: "Closed-won" }))
      expect(within(table()).queryByRole("row", { name: /Pruitt/ })).not.toBeInTheDocument()
      expect(rows()).toHaveLength(5)
      expect(within(region()).getByText("1 overdue")).toBeInTheDocument()
      await user.click(filter("Won"))
      expect(within(row(/Pruitt/)).getByRole("button", { name: "Stage: Closed-won" })).toBeInTheDocument()
      expect(within(row(/Pruitt/)).getByText("just now")).toBeInTheDocument()
    })
  })

  describe("next step", () => {
    it("marking it done asks for the next one and swaps it in", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(row(/Okafor/)).getByRole("button", { name: "Mark next step done for Coach Reggie Okafor" }))
      const dialog = await screen.findByRole("dialog", { name: "Next step done" })
      expect(dialog).toHaveTextContent("“Follow up on the trial seats” is done for Coach Reggie Okafor")
      const save = within(dialog).getByRole("button", { name: "Save next step" })
      expect(save).toBeDisabled()
      const input = within(dialog).getByRole("textbox", { name: "New next step" })
      expect(input).toHaveAttribute("maxlength", String(CAPS.nextStep))
      await user.type(input, "Send the staff-seat invoice")
      await user.type(within(dialog).getByLabelText("Due date"), "2026-08-30")
      await user.click(save)
      expect(screen.queryByRole("dialog", { name: "Next step done" })).not.toBeInTheDocument()
      const r = row(/Okafor/)
      expect(within(r).getByText("Send the staff-seat invoice")).toBeInTheDocument()
      expect(within(r).getByText("Due in 3 days")).toBeInTheDocument()
      expect(r).not.toHaveAttribute("data-overdue")
      expect(within(region()).getByText("1 overdue")).toBeInTheDocument()
      // No longer overdue, so it sorts after today's deadlines.
      expect(rows()[0]).toHaveAttribute("data-deal", "deal-3")
    })
  })

  describe("delete", () => {
    it("asks first; Cancel keeps the deal, Delete removes it", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(within(row(/Alvarez/)).getByRole("button", { name: "Delete Dana Alvarez" }))
      let dialog = await screen.findByRole("dialog", { name: "Delete this deal?" })
      expect(dialog).toHaveTextContent("Dana Alvarez · Gulf Coast Coaches Clinic (host) · Clinic package")
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
      expect(row(/Alvarez/)).toBeInTheDocument()

      await user.click(within(row(/Alvarez/)).getByRole("button", { name: "Delete Dana Alvarez" }))
      dialog = await screen.findByRole("dialog", { name: "Delete this deal?" })
      await user.click(within(dialog).getByRole("button", { name: "Delete" }))
      expect(within(table()).queryByRole("row", { name: /Alvarez/ })).not.toBeInTheDocument()
      expect(rows()).toHaveLength(5)
    })
  })

  describe("empty states", () => {
    it("says so when a filter has nothing, and when there are no deals at all", async () => {
      const user = userEvent.setup()
      saveState(window.localStorage, reducer(initialState(FIXED_NOW_MS), { type: "delete-deal", id: "deal-8" }))
      renderScreen()
      await user.click(filter("Lost"))
      const empty = within(region()).getByRole("status", { name: "No deals" })
      expect(empty).toHaveTextContent("No lost deals")
      expect(empty).toHaveTextContent("Switch the filter above")

      saveState(window.localStorage, { deals: [], nextId: 1 })
      renderScreen()
      const none = within(screen.getAllByRole("region", { name: "Deals" }).at(-1)!).getByRole("status", { name: "No deals" })
      expect(none).toHaveTextContent("No live deals")
      expect(none).toHaveTextContent("A hunt becomes a deal when someone is actually talking")
    })
  })

  describe("clock", () => {
    it("every relative figure follows the instant the page was given", () => {
      // 23:30 CT on 7 Oct 2026: the seed must say the 7th, not the 8th.
      renderScreen(LATE_EVENING_CT_MS)
      expect(within(row(/Pruitt/)).getByText("5 Oct 2026")).toBeInTheDocument()
      expect(within(row(/Pruitt/)).getByText("Overdue 2 days")).toBeInTheDocument()
      expect(within(row(/Whitaker/)).getByText("9 Oct 2026")).toBeInTheDocument()
      expect(within(row(/Treadwell/)).getByText("Sun, Oct 4")).toHaveAttribute("title", "4 Oct 2026, 12:00 PM CT")
    })
  })

  describe("keyboard", () => {
    it("reaches Add, the stage pill, Edit and Delete with Tab and operates them with Enter", async () => {
      const user = userEvent.setup()
      renderScreen()
      within(region()).getByRole("button", { name: "Add deal" }).focus()
      await user.keyboard("{Enter}")
      expect(await screen.findByRole("dialog", { name: "Add deal" })).toBeInTheDocument()
      await user.keyboard("{Escape}")
      expect(screen.queryByRole("dialog", { name: "Add deal" })).not.toBeInTheDocument()

      const stage = within(row(/Pruitt/)).getByRole("button", { name: "Stage: Verbal" })
      stage.focus()
      await user.keyboard("{Enter}")
      const menu = await screen.findByRole("menu")
      // Opening by keyboard highlights the first item; three down is Closed-won.
      expect(within(menu).getByRole("menuitemradio", { name: "Talking" })).toHaveFocus()
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}")
      expect(within(menu).getByRole("menuitemradio", { name: "Closed-won" })).toHaveFocus()
      await user.keyboard("{Enter}")
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
      expect(within(table()).queryByRole("row", { name: /Pruitt/ })).not.toBeInTheDocument()

      within(row(/Okafor/)).getByRole("button", { name: "Edit Coach Reggie Okafor" }).focus()
      await user.keyboard("{Enter}")
      expect(await screen.findByRole("dialog", { name: "Edit deal" })).toBeInTheDocument()
      await user.keyboard("{Escape}")

      within(row(/Okafor/)).getByRole("button", { name: "Delete Coach Reggie Okafor" }).focus()
      await user.keyboard("{Enter}")
      const confirm = await screen.findByRole("dialog", { name: "Delete this deal?" })
      // Tab reaches Delete from wherever the dialog parked focus (close ×, Cancel).
      const del = within(confirm).getByRole("button", { name: "Delete" })
      for (let i = 0; i < 4 && document.activeElement !== del; i++) await user.tab()
      expect(del).toHaveFocus()
      await user.keyboard("{Enter}")
      expect(within(table()).queryByRole("row", { name: /Okafor/ })).not.toBeInTheDocument()
    })
  })
})
