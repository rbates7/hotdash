import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatRelativeDay } from "@/lib/clock"
import { INITIATIVE_TYPE_LABEL } from "@/lib/community-development"
import { PHONE_QUERY } from "@/hooks/use-mobile"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import {
  CommunityDevelopmentScreen,
  COLUMNS,
  TABLET_COLUMNS,
  initiativeCardMeta,
  isTabletHiddenColumn,
} from "@/components/community-development/community-development-screen"
import {
  CommunityDevelopmentProvider,
  initialState,
  saveState,
} from "@/components/community-development/community-development-store"
import {
  CD_DESTRUCTIVE,
  CD_PAIR,
  CD_PRESSED,
  CD_SHEET,
  CD_TEXTAREA,
  CD_TOUCH,
  TABLET_NAME_CELL,
} from "@/components/community-development/responsive"

const TODAY = "2026-10-07"
const NOW_MS = new Date("2026-10-07T17:00:00.000Z").getTime()

function renderScreen(nowMs = NOW_MS) {
  return render(
    <CommunityDevelopmentProvider nowMs={nowMs}>
      <CommunityDevelopmentScreen />
    </CommunityDevelopmentProvider>
  )
}

function installMatchMedia(width = 1440) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === PHONE_QUERY ? width <= 767 : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function mockPhone() {
  installMatchMedia(390)
}

const section = () => screen.getByRole("region", { name: "Giving initiatives" })
const list = () => within(section()).getByRole("list")
const card = (name: string) => within(list()).getByRole("button", { name: new RegExp(`^${name}`) })
const table = () => screen.getByRole("table", { name: "Giving initiatives" })
const row = (re: RegExp) => within(table()).getByRole("row", { name: re })

describe("Community Development responsive", () => {
  beforeEach(() => {
    installMatchMedia(1440)
  })

  it("maps tablet columns to Name, Type, When, Status, Owner", () => {
    expect(TABLET_COLUMNS).toEqual(["Name", "Type", "When", "Status", "Owner"])
    expect(COLUMNS.filter((c) => !isTabletHiddenColumn(c))).toEqual([...TABLET_COLUMNS])
  })

  it("hides Partner and Impact on the tablet table and constrains Name", () => {
    renderScreen()
    const heads = within(table()).getAllByRole("columnheader")
    expect(heads.find((h) => h.textContent === "Partner")?.className).toMatch(/hidden/)
    expect(heads.find((h) => h.textContent === "Impact")?.className).toMatch(/hidden/)
    expect(heads.find((h) => h.textContent === "Type")?.className).not.toMatch(/hidden/)
    expect(heads.find((h) => h.textContent === "Owner")?.className).not.toMatch(/hidden/)
    expect(TABLET_NAME_CELL).toMatch(/max-xl:max-w-0/)
    expect(TABLET_NAME_CELL).toMatch(/max-xl:min-w-0!/)
    expect(within(row(/Equipment drive for Yates/)).getAllByRole("cell")[0].className).toMatch(
      /max-xl:max-w-0/
    )
  })

  it("renders seed rows as RowCollapse cards with Deke 7:47 meta", () => {
    renderScreen()
    const cards = within(list()).getAllByRole("listitem")
    expect(cards).toHaveLength(8)
    expect(cards.map((c) => c.querySelector(`[data-slot='${ROW_COLLAPSE_SLOT}']`))).not.toContain(null)

    const yates = card("Equipment drive for Yates High School")
    expect(within(yates).getByTestId("status-pill")).toHaveTextContent("Active")
    expect(yates).toHaveTextContent(`${INITIATIVE_TYPE_LABEL.donation} · Yates High School football`)
    expect(yates).toHaveTextContent(formatRelativeDay("2026-10-15", TODAY))
    expect(yates).toHaveTextContent("Skye")
    expect(within(yates).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(within(yates).getByText("Type:", { exact: false })).toHaveClass("sr-only")
    expect(within(yates).getByText("When:", { exact: false })).toHaveClass("sr-only")

    const meta = initiativeCardMeta(initialState(TODAY).initiatives[3], TODAY)
    expect(meta[0]).toEqual({
      label: "Type",
      value: "Donation · Yates High School football",
    })
    expect(meta[1]?.value).toContain("Skye")
  })

  it("pressed filters are solid primary at every width", () => {
    renderScreen()
    for (const name of ["Filter by type", "Filter by status"]) {
      const group = screen.getByRole("group", { name })
      for (const b of within(group).getAllByRole("button")) {
        expect(b).toHaveClass(CD_PRESSED.split(" ")[0]!)
        expect(b.className).toContain("aria-pressed:bg-primary!")
        expect(b.className).toContain("aria-pressed:text-primary-foreground!")
      }
    }
  })

  it("a card tap opens the existing edit form as a bottom sheet", async () => {
    const user = userEvent.setup()
    mockPhone()
    renderScreen()
    await user.click(card("Equipment drive for Yates High School"))
    const dialog = await screen.findByRole("dialog", { name: "Edit initiative" })
    expect(dialog).toHaveAttribute("data-side", "bottom")
    expect(dialog.className).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(CD_SHEET).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Equipment drive for Yates High School")
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveAttribute(
      "data-slot",
      "sheet-close"
    )
    expect(within(dialog).getByRole("button", { name: "Delete initiative" })).toBeInTheDocument()
  })

  it("stacks Date/Cadence and Owner/Impact on phone and keeps Delete off the desktop form", async () => {
    expect(CD_PAIR).toBe("max-md:grid-cols-1")
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Add initiative" }))
    const dialog = await screen.findByRole("dialog", { name: "Add initiative" })
    expect(within(dialog).getByTestId("when-fields").className).toMatch(/max-md:grid-cols-1/)
    expect(within(dialog).getByTestId("owner-impact-fields").className).toMatch(/max-md:grid-cols-1/)
    expect(within(dialog).getByLabelText("Name")).toHaveClass("max-xl:h-11!")
    expect(within(dialog).getByRole("button", { name: "Outreach event" })).toHaveClass("max-xl:h-11!")
    expect(within(dialog).getByRole("button", { name: "Add initiative" })).toHaveClass("max-xl:h-11!")
    expect(within(dialog).getByLabelText("What we gave / impact")).toHaveClass(
      "max-xl:field-sizing-content",
      "max-xl:min-h-24!"
    )
    expect(CD_TEXTAREA).toBe("max-xl:field-sizing-content max-xl:min-h-24!")
    expect(within(dialog).queryByRole("button", { name: "Delete initiative" })).not.toBeInTheDocument()
  })

  it("the stock × closes the sheet and returns focus to the card", async () => {
    const user = userEvent.setup()
    mockPhone()
    renderScreen()
    await user.click(card("Equipment drive for Yates High School"))
    const sheet = await screen.findByRole("dialog", { name: "Edit initiative" })
    await user.click(within(sheet).getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit initiative" })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(card("Equipment drive for Yates High School")).toHaveFocus())
  })

  it("the phone sheet Delete initiative opens the existing confirm and then removes the row", async () => {
    const user = userEvent.setup()
    mockPhone()
    renderScreen()
    const next = card("Saturday volunteer coaching at Alief rec")
    await user.click(card("Equipment drive for Yates High School"))
    const edit = await screen.findByRole("dialog", { name: "Edit initiative" })
    const remove = within(edit).getByRole("button", { name: "Delete initiative" })
    expect(remove).toHaveClass("max-xl:h-11!")
    expect(remove).toHaveClass("text-danger-text!")
    await user.click(remove)
    const confirm = await screen.findByRole("dialog", { name: "Delete this initiative?" })
    expect(within(confirm).getByRole("button", { name: "Delete" })).toHaveClass("max-xl:h-11!")
    expect(within(confirm).getByRole("button", { name: "Delete" }).className).toContain(
      CD_DESTRUCTIVE
    )
    expect(CD_TOUCH).toMatch(/max-xl:h-11!/)
    await user.click(within(confirm).getByRole("button", { name: "Keep it" }))
    expect(screen.queryByRole("dialog", { name: "Delete this initiative?" })).not.toBeInTheDocument()
    expect(card("Equipment drive for Yates High School")).toBeInTheDocument()

    await user.click(card("Equipment drive for Yates High School"))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit initiative" })).getByRole("button", {
        name: "Delete initiative",
      })
    )
    await user.click(
      within(await screen.findByRole("dialog", { name: "Delete this initiative?" })).getByRole(
        "button",
        { name: "Delete" }
      )
    )
    await waitFor(() =>
      expect(within(list()).queryByRole("button", { name: /^Equipment drive/ })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(next).toHaveFocus())
  })

  it("after deleting the last card, focus moves to the heading", async () => {
    const user = userEvent.setup()
    saveState(window.localStorage, {
      initiatives: [initialState(TODAY).initiatives[3]],
      nextId: 9,
    })
    mockPhone()
    renderScreen()
    await user.click(card("Equipment drive for Yates High School"))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit initiative" })).getByRole("button", {
        name: "Delete initiative",
      })
    )
    await user.click(
      within(await screen.findByRole("dialog", { name: "Delete this initiative?" })).getByRole(
        "button",
        { name: "Delete" }
      )
    )
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Community Development" })).toHaveFocus()
    })
  })
})
