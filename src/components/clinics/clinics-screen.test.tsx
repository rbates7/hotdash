import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CLINICS_MOCK_DAY, CLINIC_LIMITS } from "@/lib/clinics"
import { SPAWN_LABEL, SPAWN_SOON } from "@/components/clinics/clinic-dialog"
import { ClinicsScreen, LEDE } from "@/components/clinics/clinics-screen"
import { COLUMNS } from "@/components/clinics/clinics-section"
import {
  ClinicsProvider,
  STORAGE_KEY,
  initialState,
  reducer,
  saveState,
} from "@/components/clinics/clinics-store"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { PERSISTENCE_COPY } from "@/components/persistence-note"

/** Noon Central on the day the mock was drawn, so rows match it verbatim. */
const NOW_MS = new Date("2026-08-28T17:00:00.000Z").getTime()
/** 23:30 Central on 7 Oct 2026 — UTC already says the 8th. */
const LATE_MS = new Date("2026-10-08T04:30:00.000Z").getTime()

function renderScreen(nowMs = NOW_MS) {
  return render(
    <ClinicsProvider nowMs={nowMs}>
      <ClinicsScreen />
    </ClinicsProvider>
  )
}

const section = (name: "Upcoming clinics" | "Past clinics") => screen.getByRole("region", { name })
const table = (name: "Upcoming clinics" | "Past clinics") => screen.getByRole("table", { name })
const bodyRows = (name: "Upcoming clinics" | "Past clinics") =>
  within(table(name)).getAllByRole("row").slice(1)
const row = (name: "Upcoming clinics" | "Past clinics", re: RegExp) =>
  within(table(name)).getByRole("row", { name: re })

async function openMenu(user: ReturnType<typeof userEvent.setup>, clinic: string) {
  await user.click(screen.getByRole("button", { name: `Actions for ${clinic}` }))
  return screen.findByRole("menu")
}

describe("ClinicsScreen", () => {
  it("renders the header, the lede, the shared note and chip, and Add clinic", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "Clinics" })).toBeInTheDocument()
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
    expect(within(screen.getByRole("banner")).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(screen.getByRole("button", { name: "Add clinic" })).toBeEnabled()
  })

  it("shows Upcoming then Past with the mock's rows, counts and columns", () => {
    renderScreen()
    for (const name of ["Upcoming clinics", "Past clinics"] as const) {
      expect(within(table(name)).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        ...COLUMNS,
        "Actions",
      ])
      expect(within(section(name)).getByTestId("section-count")).toHaveTextContent("4")
      expect(bodyRows(name)).toHaveLength(4)
    }
    const upcoming = bodyRows("Upcoming clinics")
    expect(within(upcoming[0]).getByText("Houston Offensive Staff Clinic")).toBeInTheDocument()
    expect(within(upcoming[0]).getByText("12 Sep 2026")).toBeInTheDocument()
    expect(within(upcoming[0]).getByText("in 15 days")).toBeInTheDocument()
    expect(within(upcoming[0]).getByText("Cy-Fair ISD coaches association")).toBeInTheDocument()
    expect(within(upcoming[0]).getByTestId("type-pill")).toHaveTextContent("Clinic")
    expect(within(upcoming[0]).getByTestId("attendance")).toHaveTextContent("Planned")
    expect(within(upcoming[0]).getByTestId("status-pill")).toHaveTextContent("Upcoming")
    expect(within(upcoming[0]).getByText("Trip")).toBeInTheDocument()
    expect(within(upcoming[2]).getByTestId("type-pill")).toHaveTextContent("Zoom")
    expect(within(upcoming[3]).getByText("3 Oct 2026")).toBeInTheDocument()

    const past = bodyRows("Past clinics")
    expect(within(past[0]).getByText("Spring Houston walk-through")).toBeInTheDocument()
    expect(within(past[0]).getByText("8 Jun 2026")).toBeInTheDocument()
    expect(within(past[0]).getByText("81 days ago")).toBeInTheDocument()
    expect(within(past[0]).getByText("14 leads · 11 emails · 3 demos")).toBeInTheDocument()
    expect(within(past[0]).getByTestId("attendance")).toHaveTextContent("Attended")
    expect(within(past[0]).getByTestId("status-pill")).toHaveTextContent("Done")
    expect(within(past[3]).getByText("Fort Worth spring clinic")).toBeInTheDocument()
  })

  it("marks every seed row as sample data", () => {
    renderScreen()
    for (const name of ["Upcoming clinics", "Past clinics"] as const) {
      for (const r of bodyRows(name)) {
        expect(within(r).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
      }
    }
  })

  it("splits around the Central day: at 23:30 CT a clinic dated today is still Upcoming", async () => {
    // Save a copy with a row dated 7 Oct 2026 so the late-evening request has
    // something to file: UTC would already call it yesterday.
    const today = "2026-10-07"
    saveState(window.localStorage, {
      ...initialState(today),
      clinics: [{ ...initialState(today).clinics[0], id: "clinic-1", name: "Tonight's walkthrough", date: today }],
      nextId: 9,
    })
    renderScreen(LATE_MS)
    const r = row("Upcoming clinics", /Tonight's walkthrough/)
    expect(within(r).getByText("Today")).toBeInTheDocument()
    expect(within(r).getByTestId("status-pill")).toHaveTextContent("Upcoming")
    expect(bodyRows("Past clinics")).toHaveLength(1)
    expect(within(bodyRows("Past clinics")[0]).getByRole("status")).toHaveTextContent("Nothing has happened yet.")
  })

  describe("hydration", () => {
    it("shows skeletons, never the seed, until localStorage has been read", async () => {
      saveState(window.localStorage, reducer(initialState(CLINICS_MOCK_DAY), { type: "remove", id: "clinic-1" }))
      const removed: Element[] = []
      const observer = new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if (n instanceof Element) removed.push(n)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      renderScreen()
      await Promise.resolve()
      observer.disconnect()

      const wasSkeleton = (el: Element) =>
        el.matches('[aria-label="Loading saved clinics"]') ||
        el.querySelector('[aria-label="Loading saved clinics"]') !== null
      expect(removed.some(wasSkeleton)).toBe(true)
      for (const el of removed) {
        expect(el.matches("[data-clinic]") || el.querySelector("[data-clinic]")).toBeFalsy()
        expect(el.textContent).not.toContain("Houston Offensive Staff Clinic")
      }
      expect(screen.queryByRole("status", { name: "Loading saved clinics" })).not.toBeInTheDocument()
      expect(screen.queryByText("Houston Offensive Staff Clinic")).not.toBeInTheDocument()
      expect(bodyRows("Upcoming clinics")).toHaveLength(3)
    })
  })

  describe("add", () => {
    it("opens the dialog on the name, defaults the date to today, caps every field, and the submit waits for a name", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add clinic" }))
      const dialog = await screen.findByRole("dialog", { name: "Add clinic" })
      const name = within(dialog).getByLabelText("Name")
      expect(name).toHaveFocus()
      expect(name).toHaveAttribute("maxlength", String(CLINIC_LIMITS.name))
      expect(within(dialog).getByLabelText("Host")).toHaveAttribute("maxlength", String(CLINIC_LIMITS.host))
      expect(within(dialog).getByLabelText("City")).toHaveAttribute("maxlength", String(CLINIC_LIMITS.city))
      expect(within(dialog).getByLabelText("Owner")).toHaveAttribute("maxlength", String(CLINIC_LIMITS.owner))
      expect(within(dialog).getByLabelText("Notes")).toHaveAttribute("maxlength", String(CLINIC_LIMITS.notes))
      expect(within(dialog).getByLabelText("Leads")).toHaveAttribute("max", String(CLINIC_LIMITS.collected))
      expect(within(dialog).getByLabelText("Date")).toHaveValue(CLINICS_MOCK_DAY)
      expect(within(dialog).getByLabelText("Owner")).toHaveValue("Trip")
      expect(within(dialog).getByRole("group", { name: "Type" })).toBeInTheDocument()
      expect(within(dialog).getByRole("button", { name: "Clinic", pressed: true })).toBeInTheDocument()
      expect(within(dialog).getByRole("button", { name: "Planned", pressed: true })).toBeInTheDocument()

      const submit = within(dialog).getByRole("button", { name: "Add clinic" })
      expect(submit).toBeDisabled()
      await user.type(name, "   ")
      expect(submit).toBeDisabled()
      await user.clear(name)
      await user.type(name, "Katy spring install")
      expect(submit).toBeEnabled()
    })

    it("the Spawn Sales Opportunity button is disabled, titled, and described for the keyboard", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add clinic" }))
      const dialog = await screen.findByRole("dialog", { name: "Add clinic" })
      const spawn = within(dialog).getByRole("button", { name: SPAWN_LABEL })
      expect(spawn).toBeDisabled()
      expect(spawn).toHaveAttribute("title", SPAWN_SOON)
      expect(spawn).toHaveAccessibleDescription(SPAWN_SOON)
    })

    it("adds a clinic, files it by date, and the note says Saved", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add clinic" }))
      const dialog = await screen.findByRole("dialog", { name: "Add clinic" })
      await user.type(within(dialog).getByLabelText("Name"), "Katy spring install")
      await user.type(within(dialog).getByLabelText("Host"), "Katy ISD")
      await user.type(within(dialog).getByLabelText("City"), "Katy")
      await user.click(within(dialog).getByRole("button", { name: "Staff meeting" }))
      const date = within(dialog).getByLabelText("Date")
      await user.clear(date)
      await user.type(date, "2026-09-05")
      await user.click(within(dialog).getByRole("button", { name: "Add clinic" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // Sits between 28 Aug and 12 Sep, so it heads the Upcoming list.
      const rows = bodyRows("Upcoming clinics")
      expect(rows).toHaveLength(5)
      expect(within(rows[0]).getByText("Katy spring install")).toBeInTheDocument()
      expect(within(rows[0]).getByText("5 Sep 2026")).toBeInTheDocument()
      expect(within(rows[0]).getByText("in 8 days")).toBeInTheDocument()
      expect(within(rows[0]).getByTestId("type-pill")).toHaveTextContent("Staff meeting")
      expect(within(rows[0]).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
      expect(within(section("Upcoming clinics")).getByTestId("section-count")).toHaveTextContent("5")
      expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.saved)
      expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled()
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Katy spring install")
    })
  })

  describe("row actions", () => {
    it("the menu offers edit, record, the two other attendance marks, a disabled spawn and delete", async () => {
      const user = userEvent.setup()
      renderScreen()
      const menu = await openMenu(user, "Houston Offensive Staff Clinic")
      expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
        "Edit",
        "Record collected",
        "Mark attended",
        "Mark skipped",
        `${SPAWN_LABEL}Soon`,
        "Delete",
      ])
      expect(within(menu).getByRole("menuitem", { name: new RegExp(SPAWN_LABEL) })).toHaveAttribute("aria-disabled", "true")
    })

    it("marks a past clinic attended, then skipped, and the status pill follows", async () => {
      const user = userEvent.setup()
      saveState(window.localStorage, reducer(initialState(CLINICS_MOCK_DAY), {
        type: "set-attendance", id: "clinic-5", attendance: "planned",
      }))
      renderScreen()
      const r = () => row("Past clinics", /Spring Houston walk-through/)
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Unconfirmed")

      let menu = await openMenu(user, "Spring Houston walk-through")
      await user.click(within(menu).getByRole("menuitem", { name: "Mark attended" }))
      expect(within(r()).getByTestId("attendance")).toHaveTextContent("Attended")
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Done")

      menu = await openMenu(user, "Spring Houston walk-through")
      await user.click(within(menu).getByRole("menuitem", { name: "Mark skipped" }))
      expect(within(r()).getByTestId("status-pill")).toHaveTextContent("Skipped")
    })

    it("Record collected opens the edit dialog on Leads and the row shows what was entered", async () => {
      const user = userEvent.setup()
      renderScreen()
      const menu = await openMenu(user, "Houston Offensive Staff Clinic")
      await user.click(within(menu).getByRole("menuitem", { name: "Record collected" }))
      const dialog = await screen.findByRole("dialog", { name: "Edit clinic" })
      const leads = within(dialog).getByLabelText("Leads")
      expect(leads).toHaveFocus()
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Houston Offensive Staff Clinic")
      await user.type(leads, "12")
      await user.type(within(dialog).getByLabelText("Emails"), "9")
      await user.type(within(dialog).getByLabelText("Demos"), "2")
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(within(row("Upcoming clinics", /Houston Offensive/)).getByText("12 leads · 9 emails · 2 demos")).toBeInTheDocument()
    })

    it("editing the date moves a clinic from Upcoming to Past; saving unchanged does not mark anything edited", async () => {
      const user = userEvent.setup()
      renderScreen()
      let menu = await openMenu(user, "Austin staff install")
      await user.click(within(menu).getByRole("menuitem", { name: "Edit" }))
      let dialog = await screen.findByRole("dialog", { name: "Edit clinic" })
      expect(within(dialog).getByLabelText("Name")).toHaveFocus()
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

      menu = await openMenu(user, "Austin staff install")
      await user.click(within(menu).getByRole("menuitem", { name: "Edit" }))
      dialog = await screen.findByRole("dialog", { name: "Edit clinic" })
      const date = within(dialog).getByLabelText("Date")
      await user.clear(date)
      await user.type(date, "2026-08-20")
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
      expect(bodyRows("Upcoming clinics")).toHaveLength(3)
      const moved = row("Past clinics", /Austin staff install/)
      expect(within(moved).getByText("8 days ago")).toBeInTheDocument()
      expect(within(moved).getByTestId("status-pill")).toHaveTextContent("Unconfirmed")
      expect(within(moved).getByText("Nothing yet")).toBeInTheDocument()
      expect(bodyRows("Past clinics")[0]).toBe(moved)
    })

    it("delete asks first; Keep it leaves the row, Delete removes it", async () => {
      const user = userEvent.setup()
      renderScreen()
      let menu = await openMenu(user, "Dallas 7-on-7 Coaches Night")
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }))
      let dialog = await screen.findByRole("dialog", { name: "Delete this clinic?" })
      expect(dialog).toHaveTextContent("Dallas 7-on-7 Coaches Night · 19 Sep 2026")
      await user.click(within(dialog).getByRole("button", { name: "Keep it" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(bodyRows("Upcoming clinics")).toHaveLength(4)

      menu = await openMenu(user, "Dallas 7-on-7 Coaches Night")
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }))
      dialog = await screen.findByRole("dialog", { name: "Delete this clinic?" })
      await user.click(within(dialog).getByRole("button", { name: "Delete" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(bodyRows("Upcoming clinics")).toHaveLength(3)
      expect(screen.queryByText("Dallas 7-on-7 Coaches Night")).not.toBeInTheDocument()
    })
  })

  describe("empty states", () => {
    it("an empty section says so in its table", () => {
      saveState(window.localStorage, {
        ...initialState(CLINICS_MOCK_DAY),
        clinics: initialState(CLINICS_MOCK_DAY).clinics.filter((c) => c.date < CLINICS_MOCK_DAY),
      })
      renderScreen()
      expect(within(section("Upcoming clinics")).getByTestId("section-count")).toHaveTextContent("0")
      expect(within(table("Upcoming clinics")).getByRole("status")).toHaveTextContent("Nothing on the calendar")
      expect(bodyRows("Past clinics")).toHaveLength(4)
    })

    it("with no clinics at all, one empty state replaces both sections and can add", async () => {
      const user = userEvent.setup()
      saveState(window.localStorage, { clinics: [], nextId: 9 })
      renderScreen()
      const empty = screen.getByRole("status", { name: "No clinics" })
      expect(empty).toHaveTextContent("No clinics on the calendar")
      expect(screen.queryByRole("region", { name: "Upcoming clinics" })).not.toBeInTheDocument()
      await user.click(within(empty).getByRole("button", { name: "Add clinic" }))
      const dialog = await screen.findByRole("dialog", { name: "Add clinic" })
      await user.type(within(dialog).getByLabelText("Name"), "First one")
      await user.click(within(dialog).getByRole("button", { name: "Add clinic" }))
      expect(screen.queryByRole("status", { name: "No clinics" })).not.toBeInTheDocument()
      const r = row("Upcoming clinics", /First one/)
      expect(within(r).getByText("Today")).toBeInTheDocument()
      // The counter carried on from the saved copy; no id collision with the seed.
      expect(r).toHaveAttribute("data-clinic", "clinic-9")
    })
  })

  it("Reset asks first and then puts the seed back", async () => {
    const user = userEvent.setup()
    saveState(window.localStorage, { clinics: [], nextId: 9 })
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Reset" }))
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(dialog).getByRole("button", { name: "Reset" }))
    expect(bodyRows("Upcoming clinics")).toHaveLength(4)
    expect(bodyRows("Past clinics")).toHaveLength(4)
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
    const menu = await openMenu(user, "Houston Offensive Staff Clinic")
    await user.click(within(menu).getByRole("menuitem", { name: "Mark skipped" }))
    expect(screen.getByRole("alert")).toHaveTextContent(PERSISTENCE_COPY.failed)
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
    spy.mockRestore()
  })
})
