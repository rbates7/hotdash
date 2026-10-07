import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { INITIATIVE_LIMITS } from "@/lib/community-development"
import { addDays, formatDate } from "@/lib/clock"
import { SPAWN_LABEL, SPAWN_SOON } from "@/components/community-development/initiative-dialog"
import {
  COLUMNS,
  CommunityDevelopmentScreen,
  LEDE,
} from "@/components/community-development/community-development-screen"
import {
  CommunityDevelopmentProvider,
  STORAGE_KEY,
  initialState,
  reducer,
  saveState,
} from "@/components/community-development/community-development-store"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { LATE_EVENING_CT_MS } from "@/test/clock"
import { PERSISTENCE_COPY, PERSISTENCE_NOTE_NAME, RESET_DISABLED_HINT } from "@/components/persistence-note"

const TODAY = "2026-10-07"
const NOW_MS = new Date("2026-10-07T17:00:00.000Z").getTime()
const LATE_MS = LATE_EVENING_CT_MS

function renderScreen(nowMs = NOW_MS) {
  return render(
    <CommunityDevelopmentProvider nowMs={nowMs}>
      <CommunityDevelopmentScreen />
    </CommunityDevelopmentProvider>
  )
}

const table = () => screen.getByRole("table", { name: "Giving initiatives" })
const bodyRows = () => within(table()).getAllByRole("row").slice(1)
const row = (re: RegExp) => within(table()).getByRole("row", { name: re })
const summary = () => screen.getByRole("group", { name: "Giving summary" })

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Actions for ${name}` }))
  return screen.findByRole("menu")
}

describe("CommunityDevelopmentScreen", () => {
  it("renders the header, the lede, the shared note and chip, and Add initiative", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Community Development" })).toBeInTheDocument()
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAccessibleDescription(RESET_DISABLED_HINT)
    const header = screen.getByRole("heading", { level: 1, name: "Community Development" }).closest("header")!
    expect(within(header).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(screen.getByRole("button", { name: "Add initiative" })).toBeEnabled()
  })

  it("shows the summary strip, filters, columns and the eight seed rows", () => {
    renderScreen()
    expect(within(summary()).getByText("Active")).toBeInTheDocument()
    expect(within(summary()).getByText("2")).toBeInTheDocument()
    expect(within(summary()).getByText("Upcoming (30 days)")).toBeInTheDocument()
    expect(within(summary()).getByText("3")).toBeInTheDocument()
    expect(within(summary()).getByText("Done this year")).toBeInTheDocument()
    expect(within(summary()).getByText("1")).toBeInTheDocument()

    expect(screen.getByRole("group", { name: "Filter by type" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument()

    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      ...COLUMNS,
      "Actions",
    ])
    expect(screen.getByTestId("section-count")).toHaveTextContent("8")
    expect(bodyRows()).toHaveLength(8)

    const first = row(/Equipment drive for Yates High School/)
    expect(within(first).getByTestId("type-pill")).toHaveTextContent("Donation")
    expect(within(first).getByTestId("status-pill")).toHaveTextContent("Active")
    expect(within(first).getByText("Yates High School football")).toBeInTheDocument()
    expect(within(first).getByText(formatDate(addDays(TODAY, 8)))).toBeInTheDocument()
    expect(within(first).getByText("in 8 days")).toBeInTheDocument()
    expect(within(first).getByText("Skye")).toBeInTheDocument()

    const idea = row(/Chlk Foundation coaching scholarship/)
    expect(within(idea).getByTestId("type-pill")).toHaveTextContent("Foundation program")
    expect(within(idea).getByTestId("status-pill")).toHaveTextContent("Idea")
    expect(within(idea).getByText("Annual, each spring")).toBeInTheDocument()
  })

  it("marks every seed row as sample data", () => {
    renderScreen()
    for (const r of bodyRows()) {
      expect(within(r).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    }
  })

  it("splits around the Central day: at 23:30 CT a row dated today is still upcoming", () => {
    saveState(window.localStorage, {
      ...initialState(TODAY),
      initiatives: [
        { ...initialState(TODAY).initiatives[0], id: "initiative-1", name: "Tonight's serve-day", date: TODAY },
      ],
      nextId: 9,
    })
    renderScreen(LATE_MS)
    const r = row(/Tonight's serve-day/)
    expect(within(r).getByText("Today")).toBeInTheDocument()
    expect(within(summary()).getByText("Upcoming (30 days)").previousSibling).toHaveTextContent("1")
  })

  describe("hydration", () => {
    it("shows skeletons, never the seed, until localStorage has been read", async () => {
      saveState(
        window.localStorage,
        reducer(initialState(TODAY), { type: "remove", id: "initiative-1" })
      )
      const removed: Element[] = []
      const observer = new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if (n instanceof Element) removed.push(n)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      renderScreen()
      await Promise.resolve()
      observer.disconnect()

      const wasSkeleton = (el: Element) =>
        el.matches('[aria-label="Loading saved initiatives"]') ||
        el.querySelector('[aria-label="Loading saved initiatives"]') !== null
      expect(removed.some(wasSkeleton)).toBe(true)
      for (const el of removed) {
        expect(el.matches("[data-initiative]") || el.querySelector("[data-initiative]")).toBeFalsy()
        expect(el.textContent).not.toContain("Youth flag-football clinic volunteer day")
      }
      expect(screen.queryByRole("status", { name: "Loading saved initiatives" })).not.toBeInTheDocument()
      expect(screen.queryByText("Youth flag-football clinic volunteer day")).not.toBeInTheDocument()
      expect(bodyRows()).toHaveLength(7)
    })
  })

  describe("filters", () => {
    it("narrows the table by type and status, and an empty filter says so", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Volunteer" }))
      expect(bodyRows()).toHaveLength(3)
      expect(screen.getByTestId("section-count")).toHaveTextContent("3")
      await user.click(screen.getByRole("button", { name: "Idea" }))
      expect(screen.getByRole("status", { name: "No matching initiatives" })).toHaveTextContent(
        "Nothing in this view"
      )
      await user.click(screen.getByRole("button", { name: "All types" }))
      expect(bodyRows()).toHaveLength(2)
    })
  })

  describe("add", () => {
    it("opens the dialog on the name, defaults the date to today, caps every field, and the submit waits for a name", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add initiative" }))
      const dialog = await screen.findByRole("dialog", { name: "Add initiative" })
      const name = within(dialog).getByLabelText("Name")
      expect(name).toHaveFocus()
      expect(name).toHaveAttribute("maxlength", String(INITIATIVE_LIMITS.name))
      expect(within(dialog).getByLabelText("Beneficiary / partner")).toHaveAttribute(
        "maxlength",
        String(INITIATIVE_LIMITS.partner)
      )
      expect(within(dialog).getByLabelText("Cadence")).toHaveAttribute(
        "maxlength",
        String(INITIATIVE_LIMITS.cadence)
      )
      expect(within(dialog).getByLabelText("Owner")).toHaveAttribute("maxlength", String(INITIATIVE_LIMITS.owner))
      expect(within(dialog).getByLabelText("What we gave / impact")).toHaveAttribute(
        "maxlength",
        String(INITIATIVE_LIMITS.impact)
      )
      expect(within(dialog).getByLabelText("Date")).toHaveValue(TODAY)
      expect(within(dialog).getByLabelText("Owner")).toHaveValue("Rashad")
      expect(within(dialog).getByRole("button", { name: "Volunteer", pressed: true })).toBeInTheDocument()
      expect(within(dialog).getByRole("button", { name: "Planned", pressed: true })).toBeInTheDocument()

      const submit = within(dialog).getByRole("button", { name: "Add initiative" })
      expect(submit).toBeDisabled()
      await user.type(name, "   ")
      expect(submit).toBeDisabled()
      await user.clear(name)
      await user.type(name, "Saturday park clean-up")
      expect(submit).toBeEnabled()
    })

    it("the Could spawn a Clinic button is disabled, titled, and described for the keyboard", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add initiative" }))
      const dialog = await screen.findByRole("dialog", { name: "Add initiative" })
      const spawn = within(dialog).getByRole("button", { name: SPAWN_LABEL })
      expect(spawn).toBeDisabled()
      expect(spawn).toHaveAttribute("title", SPAWN_SOON)
      expect(spawn).toHaveAccessibleDescription(SPAWN_SOON)
    })

    it("adds an initiative, does not tag it as sample data, and the note says Saved", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add initiative" }))
      const dialog = await screen.findByRole("dialog", { name: "Add initiative" })
      await user.type(within(dialog).getByLabelText("Name"), "Saturday park clean-up")
      await user.type(within(dialog).getByLabelText("Beneficiary / partner"), "Buffalo Bayou Park")
      await user.click(within(dialog).getByRole("button", { name: "Outreach event" }))
      await user.click(within(dialog).getByRole("button", { name: "Add initiative" }))
      expect(screen.queryByRole("dialog", { name: "Add initiative" })).not.toBeInTheDocument()

      const r = row(/Saturday park clean-up/)
      expect(within(r).getByTestId("type-pill")).toHaveTextContent("Outreach event")
      expect(within(r).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
      expect(screen.getByTestId("section-count")).toHaveTextContent("9")
      expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.saved)
      expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled()
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Saturday park clean-up")
    })
  })

  describe("row actions", () => {
    it("the menu offers view, edit, the other status marks, a disabled spawn and delete", async () => {
      const user = userEvent.setup()
      renderScreen()
      const menu = await openMenu(user, "Youth flag-football clinic volunteer day")
      expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
        "View",
        "Edit",
        "Mark idea",
        "Mark active",
        "Mark done",
        `${SPAWN_LABEL}Soon`,
        "Delete",
      ])
      expect(within(menu).getByRole("menuitem", { name: new RegExp(SPAWN_LABEL) })).toHaveAttribute(
        "aria-disabled",
        "true"
      )
    })

    it("marks a planned row active, then done, and the status pill follows", async () => {
      const user = userEvent.setup()
      renderScreen()
      const r = () => row(/Youth flag-football clinic volunteer day/)
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Planned")

      let menu = await openMenu(user, "Youth flag-football clinic volunteer day")
      await user.click(within(menu).getByRole("menuitem", { name: "Mark active" }))
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Active")

      menu = await openMenu(user, "Youth flag-football clinic volunteer day")
      await user.click(within(menu).getByRole("menuitem", { name: "Mark done" }))
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Done")
    })

    it("View opens the detail sheet; Edit from the sheet updates the row", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Youth flag-football clinic volunteer day" }))
      const sheet = await screen.findByRole("dialog", { name: /Youth flag-football clinic volunteer day/ })
      expect(within(sheet).getByText("Houston Youth Flag League")).toBeInTheDocument()
      expect(within(sheet).getByText("40 kids coached")).toBeInTheDocument()
      await user.click(within(sheet).getByRole("button", { name: "Edit" }))
      const dialog = await screen.findByRole("dialog", { name: "Edit initiative" })
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Youth flag-football clinic volunteer day")
      await user.clear(within(dialog).getByLabelText("What we gave / impact"))
      await user.type(within(dialog).getByLabelText("What we gave / impact"), "48 kids coached")
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
      expect(within(row(/Youth flag-football/)).getByText("48 kids coached")).toBeInTheDocument()
    })

    it("delete asks first; Keep it leaves the row, Delete removes it", async () => {
      const user = userEvent.setup()
      renderScreen()
      let menu = await openMenu(user, "Booster-club talk on giving back")
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }))
      let dialog = await screen.findByRole("dialog", { name: "Delete this initiative?" })
      expect(dialog).toHaveTextContent("Booster-club talk on giving back · Once we have a date")
      await user.click(within(dialog).getByRole("button", { name: "Keep it" }))
      expect(screen.queryByRole("dialog", { name: "Delete this initiative?" })).not.toBeInTheDocument()
      expect(bodyRows()).toHaveLength(8)

      menu = await openMenu(user, "Booster-club talk on giving back")
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }))
      dialog = await screen.findByRole("dialog", { name: "Delete this initiative?" })
      await user.click(within(dialog).getByRole("button", { name: "Delete" }))
      expect(screen.queryByText("Booster-club talk on giving back")).not.toBeInTheDocument()
      expect(bodyRows()).toHaveLength(7)
    })
  })

  describe("empty states", () => {
    it("with no initiatives at all, one empty state replaces the table and can add", async () => {
      const user = userEvent.setup()
      saveState(window.localStorage, { initiatives: [], nextId: 9 })
      renderScreen()
      const empty = screen.getByRole("status", { name: "No initiatives" })
      expect(empty).toHaveTextContent("No giving initiatives yet")
      expect(screen.queryByRole("table", { name: "Giving initiatives" })).not.toBeInTheDocument()
      await user.click(within(empty).getByRole("button", { name: "Add initiative" }))
      const dialog = await screen.findByRole("dialog", { name: "Add initiative" })
      await user.type(within(dialog).getByLabelText("Name"), "First one")
      await user.click(within(dialog).getByRole("button", { name: "Add initiative" }))
      expect(screen.queryByRole("status", { name: "No initiatives" })).not.toBeInTheDocument()
      const r = row(/First one/)
      expect(within(r).getByText("Today")).toBeInTheDocument()
      expect(r).toHaveAttribute("data-initiative", "initiative-9")
    })
  })

  it("Reset asks first and then puts the seed back", async () => {
    const user = userEvent.setup()
    saveState(window.localStorage, { initiatives: [], nextId: 9 })
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Reset" }))
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(dialog).getByRole("button", { name: "Reset" }))
    expect(bodyRows()).toHaveLength(8)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
  })

  it("a failed save is announced and nothing claims Saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    })
    const user = userEvent.setup()
    renderScreen()
    const menu = await openMenu(user, "Youth flag-football clinic volunteer day")
    await user.click(within(menu).getByRole("menuitem", { name: "Mark active" }))
    expect(screen.getByRole("alert", { name: PERSISTENCE_NOTE_NAME })).toHaveTextContent(
      PERSISTENCE_COPY.failed
    )
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true")
    spy.mockRestore()
  })
})
