import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { CRM_CONNECTING, CRM_NOT_CONNECTED } from "@/lib/crm/case-view"
import { LOCAL_EDITS_KEY } from "@/lib/crm/local-edits"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import {
  FIXTURE_SUBJECTS,
  HOSTILE_TEXT,
  crmEmptySummary,
  crmFixtureSummary,
  crmFixtureThread,
  setCrmLoadingForTest,
  setCrmSummaryForTest,
  setCrmUnauthorizedForTest,
  stubViewport,
} from "@/test/crm"
import { configureCrmSummary } from "@/hooks/use-crm-summary"
import { EDITS_NOTE } from "@/components/crm/case-panel"
import { THREAD_NOT_FOUND } from "@/components/crm/case-thread"
import { CasesScreen, NO_CASES, NO_MATCH } from "@/components/crm/cases-screen"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm/cases",
}))

vi.mock("@/lib/clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clock")>()
  return { ...actual, now: () => new Date(FIXED_NOW_MS) }
})

beforeAll(() => {
  // Base UI's select measures its anchor; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterAll(() => vi.unstubAllGlobals())

const LIVE = crmFixtureSummary(FIXED_NOW_MS)
const URGENT = LIVE.cases.find((c) => c.subject === FIXTURE_SUBJECTS.urgent)!

beforeEach(() => {
  navigation.params = new URLSearchParams()
  navigation.push.mockReset()
  stubViewport({ width: 1440 })
  setCrmSummaryForTest(LIVE, crmFixtureThread(FIXED_NOW_MS))
})

const table = () => screen.getByRole("table", { name: "Cases", hidden: true })
const row = (subject: string) => within(table()).getByRole("row", { name: new RegExp(subject), hidden: true })

describe("Cases: live", () => {
  it("lists every case with Deke's columns, and says where edits are kept", () => {
    render(<CasesScreen />)
    expect(within(table()).getAllByRole("row")).toHaveLength(LIVE.cases.length + 1)
    const heads = within(table()).getAllByRole("columnheader").map((h) => h.textContent)
    expect(heads).toEqual(["Unread", "#", "Subject", "Contact", "Status", "Priority", "Last activity", "Channel"])
    for (const gone of ["Owner", "Assignee", "Plan", "Stripe"]) expect(heads).not.toContain(gone)
    expect(row(FIXTURE_SUBJECTS.urgent)).toHaveTextContent("#1")
    expect(row(FIXTURE_SUBJECTS.urgent)).toHaveTextContent("example.com")
    expect(within(row(FIXTURE_SUBJECTS.urgent)).getByTestId("unread-dot")).toBeInTheDocument()
    // Always visible (Simmons), not only in the header menu.
    expect(screen.getByTestId("crm-edits-note")).toHaveTextContent(EDITS_NOTE)
    expect(screen.getByTestId("crm-cases-count")).toHaveTextContent(`${LIVE.cases.length} cases`)
    expect(screen.getByRole("status")).toHaveTextContent(`Showing ${LIVE.cases.length} cases`)
  })

  it("Priority and Channel hide by breakpoint (1180 / 1440); the table hides below 820", () => {
    render(<CasesScreen />)
    expect(within(table()).getByRole("columnheader", { name: "Priority" })).toHaveClass("hidden", "min-[1180px]:table-cell")
    expect(within(table()).getByRole("columnheader", { name: "Channel" })).toHaveClass("hidden", "min-[1440px]:table-cell")
    expect(table().parentElement?.parentElement).toHaveClass("max-[819px]:hidden")
  })

  it("a personal-domain contact has no account: —", () => {
    render(<CasesScreen />)
    expect(within(row(FIXTURE_SUBJECTS.closed)).getByTestId("case-account")).toHaveTextContent("—")
  })

  it("below 820: a stacked two-line list (#id + subject; contact · status · age)", () => {
    render(<CasesScreen />)
    const list = screen.getByTestId("case-list")
    expect(list).toHaveClass("min-[820px]:hidden")
    const items = within(list).getAllByRole("listitem")
    expect(items).toHaveLength(LIVE.cases.length)
    const first = within(items[0]!).getByRole("link")
    expect(first).toHaveTextContent(`#1${FIXTURE_SUBJECTS.urgent}`)
    expect(first).toHaveTextContent("Test Person Alpha")
    expect(within(first).getByTestId("crm-status-badge")).toHaveTextContent("Waiting on you")
    expect(first).toHaveTextContent("2h")
    expect(first).toHaveAttribute("href", `/crm/cases?case=${URGENT.id}`)
  })

  it("the subject links to the panel on the current query", () => {
    navigation.params = new URLSearchParams("status=waiting_on_us")
    render(<CasesScreen />)
    const link = within(row(FIXTURE_SUBJECTS.overdue)).getByRole("link")
    expect(link).toHaveAttribute("href", "/crm/cases?status=waiting_on_us&case=case-2")
  })

  it("the status picker changes the row and saves the edit in this browser", async () => {
    const user = userEvent.setup()
    render(<CasesScreen />)
    const picker = within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: `Status: ${FIXTURE_SUBJECTS.urgent}` })
    expect(picker).toHaveTextContent("Waiting on you")
    await user.click(picker)
    await user.click(await screen.findByRole("option", { name: "Closed" }))
    await waitFor(() =>
      expect(within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: /^Status/ })).toHaveTextContent("Closed")
    )
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_EDITS_KEY)!)
    expect(saved[URGENT.id].status).toEqual({ value: "closed", from: "waiting_on_us" })
  })

  it("the priority picker accepts Low (a browser-only value) and saves the edit", async () => {
    const user = userEvent.setup()
    render(<CasesScreen />)
    const picker = within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: /^Priority/ })
    expect(picker).toHaveTextContent("Urgent")
    await user.click(picker)
    await user.click(await screen.findByRole("option", { name: "Low" }))
    await waitFor(() =>
      expect(within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: /^Priority/ })).toHaveTextContent("Low")
    )
    expect(JSON.parse(window.localStorage.getItem(LOCAL_EDITS_KEY)!)[URGENT.id].priority.value).toBe("low")
  })

  it("an edit saved earlier is laid over the live rows on load", () => {
    window.localStorage.setItem(
      LOCAL_EDITS_KEY,
      JSON.stringify({ [URGENT.id]: { status: { value: "open", from: "waiting_on_us" }, at: new Date(FIXED_NOW_MS).toISOString() } })
    )
    render(<CasesScreen />)
    expect(within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: /^Status/ })).toHaveTextContent("Open")
  })

  it("filters from the URL; no match shows Clear filters, which clears them", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams("q=no-such-case&case=case-1")
    render(<CasesScreen />)
    expect(screen.getByText(NO_MATCH, { ignore: "[role=status]" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(NO_MATCH)
    expect(screen.queryByRole("table", { name: "Cases" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases?case=case-1", { scroll: false })
  })

  it("the status segment and the Needs my reply toggle write the URL", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams("waiting=1")
    render(<CasesScreen />)
    expect(within(table()).getAllByRole("row")).toHaveLength(3)
    const toggle = screen.getByRole("button", { name: "Needs my reply" })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    await user.click(within(screen.getByRole("group", { name: "Status filter" })).getByRole("button", { name: "Closed" }))
    expect(navigation.push).toHaveBeenLastCalledWith("/crm/cases?waiting=1&status=closed", { scroll: false })
    await user.click(toggle)
    expect(navigation.push).toHaveBeenLastCalledWith("/crm/cases", { scroll: false })
  })

  it("search writes q after a pause", async () => {
    const user = userEvent.setup()
    render(<CasesScreen />)
    await user.type(screen.getByRole("searchbox", { name: "Search cases" }), "export")
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/crm/cases?q=export", { scroll: false }))
  })
})

describe("Cases: the panel", () => {
  it("≥1440: split view, ~480px, with the nav row, meta, status control, edit note and thread", async () => {
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const panel = screen.getByTestId("case-panel")
    expect(panel.tagName).toBe("ASIDE")
    expect(panel).toHaveAttribute("data-mode", "split")
    expect(panel.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_480px]")
    expect(within(panel).getByRole("heading", { level: 2, name: FIXTURE_SUBJECTS.urgent })).toBeInTheDocument()
    expect(within(panel).getByTestId("case-panel-meta")).toHaveTextContent("#1 · Test Person Alpha · example.com")
    expect(within(panel).getByTestId("case-panel-position")).toHaveTextContent("1 of 4")
    expect(within(panel).getByRole("button", { name: "Previous case" })).toBeDisabled()
    expect(within(panel).getByRole("link", { name: "Next case" })).toHaveAttribute("href", "/crm/cases?case=case-3")
    expect(within(panel).getByRole("radiogroup", { name: "Status" })).toBeInTheDocument()
    expect(within(panel).getByRole("combobox", { name: /^Priority/ })).toBeInTheDocument()
    expect(within(panel).getByTestId("crm-edits-note")).toHaveTextContent(EDITS_NOTE)
    // The row is marked open and the table drops to its "panel open" columns.
    expect(row(FIXTURE_SUBJECTS.urgent)).toHaveAttribute("data-open")
    for (const gone of ["Priority", "Last activity", "Channel"]) {
      expect(within(table()).queryByRole("columnheader", { name: gone })).not.toBeInTheDocument()
    }
    expect(await within(panel).findByRole("list", { name: "Thread" })).toBeInTheDocument()
  })

  it("the thread is plain text: markup shows as literal characters, never elements; line breaks kept", async () => {
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const thread = await within(screen.getByTestId("case-panel")).findByRole("list", { name: "Thread" })
    const [first, second] = within(thread).getAllByTestId("message-text")
    expect(first!.textContent).toContain(HOSTILE_TEXT)
    expect(first!.querySelector("script")).toBeNull()
    expect(first!.querySelector("b")).toBeNull()
    expect(thread.querySelector("script, b")).toBeNull()
    expect(first).toHaveClass("whitespace-pre-wrap", "break-words")
    expect(second!.textContent).toBe("Thanks, looking now.\nSecond line.")
    expect(within(thread).getByText("screenshot.png")).toBeInTheDocument()
    expect(document.querySelector("[data-testid=message-html]")).toBeNull()
  })

  it("the status control is a keyboard radiogroup: arrows move, select and save", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const group = within(screen.getByTestId("case-panel")).getByRole("radiogroup", { name: "Status" })
    const radios = within(group).getAllByRole("radio")
    expect(radios.map((r) => r.textContent)).toEqual(["Open", "Waiting on you", "Waiting on them", "Closed"])
    expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent("Waiting on you")
    // One tab stop, on the checked segment; 44 tall below 1280.
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1])
    expect(radios[0]).toHaveClass("max-xl:h-11")
    radios[1]!.focus()
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent("Waiting on them"))
    expect(document.activeElement).toBe(within(group).getByRole("radio", { name: "Waiting on them" }))
    expect(JSON.parse(window.localStorage.getItem(LOCAL_EDITS_KEY)!)[URGENT.id].status.value).toBe("waiting_on_them")
    await user.keyboard("{End}")
    await waitFor(() => expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent("Closed"))
    await user.click(within(group).getByRole("radio", { name: "Open" }))
    await waitFor(() => expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent("Open"))
  })

  it("≥1440: ↓ / ↑ move between cases", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    await user.keyboard("{ArrowDown}")
    expect(navigation.push).toHaveBeenLastCalledWith("/crm/cases?case=case-3", { scroll: false })
  })

  it("closing drops ?case and returns focus to the row that opened it", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams(`status=waiting_on_us&case=${URGENT.id}`)
    const { rerender } = render(<CasesScreen />)
    await user.click(within(screen.getByTestId("case-panel")).getByRole("button", { name: "Close case" }))
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases?status=waiting_on_us", { scroll: false })
    navigation.params = new URLSearchParams("status=waiting_on_us")
    rerender(<CasesScreen />)
    expect(screen.queryByTestId("case-panel")).not.toBeInTheDocument()
    expect(document.activeElement).toBe(within(row(FIXTURE_SUBJECTS.urgent)).getByRole("link"))
  })

  it("Esc closes the split panel", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    await user.keyboard("{Escape}")
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases", { scroll: false })
  })

  it("1180–1439: a 480px right sheet with no scrim, not modal; the list keeps every column", async () => {
    stubViewport({ width: 1300 })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const sheet = await screen.findByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    expect(sheet).toHaveAttribute("data-mode", "overlay")
    expect(sheet).toHaveClass("max-w-[480px]!")
    expect(document.querySelector("[data-slot=sheet-overlay]")).toHaveClass("hidden")
    // Not modal: the list is not hidden from readers and stays clickable.
    expect(screen.getByRole("table", { name: "Cases" })).toBeInTheDocument()
    expect(within(table()).getByRole("columnheader", { name: "Priority" })).toBeInTheDocument()
    expect(within(sheet).getByTestId("crm-edits-note")).toBeInTheDocument()
  })

  it("820–1179: a right sheet over a literal black scrim, 40% light / 60% dark", async () => {
    stubViewport({ width: 1000 })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const sheet = await screen.findByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    expect(sheet).toHaveAttribute("data-mode", "modal")
    expect(within(sheet).getByRole("button", { name: "Close case" })).toHaveClass("max-xl:size-11!")
    const scrim = document.querySelector("[data-slot=sheet-overlay]")
    expect(scrim).toHaveClass("bg-black/40!", "dark:bg-black/60!")
    expect(scrim?.className).not.toContain("scrim")
  })

  it("<820: a bottom sheet at 55% that grows to 95%", async () => {
    const user = userEvent.setup()
    stubViewport({ width: 390 })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const sheet = await screen.findByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    expect(sheet).toHaveAttribute("data-mode", "bottom")
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet).toHaveClass("h-[55dvh]!", "max-h-[95dvh]")
    expect(within(sheet).getByRole("radiogroup", { name: "Status" })).toBeInTheDocument()
    await user.click(within(sheet).getByRole("button", { name: "Full height" }))
    expect(sheet).toHaveAttribute("data-expanded", "true")
    expect(sheet).toHaveClass("h-[95dvh]!")
  })

  it("an id that is not in the inbox says so", () => {
    navigation.params = new URLSearchParams("case=case-99")
    render(<CasesScreen />)
    expect(within(screen.getByTestId("case-panel")).getByRole("heading", { name: "Case not found" })).toBeInTheDocument()
  })

  it("the thread route's 400 / 404 shows Thread not found", async () => {
    configureCrmSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: async () => ({ kind: "ok", data: LIVE }),
      threadFetcher: async () => ({ kind: "not_found" }),
    })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    expect(await within(screen.getByTestId("case-panel")).findByText(THREAD_NOT_FOUND)).toBeInTheDocument()
  })

  it("a 401 while reading the thread says the session expired", async () => {
    configureCrmSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: async () => ({ kind: "ok", data: LIVE }),
      threadFetcher: async () => ({ kind: "unauthorized" }),
    })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    expect(await within(screen.getByTestId("case-panel")).findByTestId("crm-session-expired")).toBeInTheDocument()
  })
})

describe("Cases: states", () => {
  it("not connected: the Not connected panel, no table, no filters, the edits note still shown", () => {
    setCrmSummaryForTest(CRM_NOT_CONNECTED)
    render(<CasesScreen />)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent("Not connected")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    expect(screen.getByTestId("crm-edits-note")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Gmail is not connected.")
  })

  it("loading and connecting: skeleton plus a busy Connecting… badge", () => {
    for (const set of [() => setCrmLoadingForTest(), () => setCrmSummaryForTest(CRM_CONNECTING)]) {
      set()
      const { unmount } = render(<CasesScreen />)
      const badge = screen.getByTestId("crm-connecting")
      expect(badge).toHaveTextContent("Connecting…")
      expect(badge).toHaveAttribute("aria-busy", "true")
      expect(screen.queryByRole("table", { name: "Cases" })).not.toBeInTheDocument()
      expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
      expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Connecting")
      unmount()
    }
  })

  it("unauthorized: Your session expired with a way to log in again, never Not connected", () => {
    setCrmUnauthorizedForTest()
    render(<CasesScreen />)
    const expired = screen.getByTestId("crm-session-expired")
    expect(expired).toHaveTextContent("Your session expired.")
    expect(within(expired).getByRole("link", { name: "Log in again" })).toHaveAttribute("href", "/unlock?next=%2Fcrm%2Fcases")
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument()
  })

  it("connected but empty: an honest empty state", () => {
    setCrmSummaryForTest(crmEmptySummary(FIXED_NOW_MS))
    render(<CasesScreen />)
    expect(screen.getByText(NO_CASES)).toBeInTheDocument()
  })

  it("stale: the rows plus Last updated", () => {
    setCrmSummaryForTest({ ...LIVE, status: "stale", lastUpdated: new Date(FIXED_NOW_MS - 3 * 3_600_000).toISOString() })
    render(<CasesScreen />)
    expect(screen.getByTestId("crm-stale")).toHaveTextContent("Last updated 3h ago")
    expect(table()).toBeInTheDocument()
  })
})
