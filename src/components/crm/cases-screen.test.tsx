import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { LOCAL_EDITS_KEY } from "@/lib/crm/local-edits"
import { CRM_CONNECTING } from "@/lib/crm/types.ours"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import {
  FIXTURE_SUBJECTS,
  crmEmptySummary,
  crmFixtureSummary,
  crmFixtureThread,
  setCrmLoadingForTest,
  setCrmSummaryForTest,
  setCrmUnauthorizedForTest,
  stubViewport,
} from "@/test/crm"
import { EDITS_NOTE } from "@/components/crm/case-panel"
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
  stubViewport({ desktop: true })
  setCrmSummaryForTest(LIVE, crmFixtureThread(FIXED_NOW_MS))
})

const table = () => screen.getByRole("table", { name: "Cases" })
const row = (subject: string) => within(table()).getByRole("row", { name: new RegExp(subject) })

describe("Cases: live", () => {
  it("lists every case with only Gmail-backed columns, and says where edits are kept", () => {
    render(<CasesScreen />)
    expect(within(table()).getAllByRole("row")).toHaveLength(LIVE.cases.length + 1)
    const heads = within(table()).getAllByRole("columnheader").map((h) => h.textContent)
    expect(heads).toEqual(["Unread", "Subject", "Account", "Contact", "Status", "Priority", "Last message", "Messages"])
    for (const gone of ["Owner", "Plan", "Plans", "Stripe"]) expect(heads).not.toContain(gone)
    expect(row(FIXTURE_SUBJECTS.urgent)).toHaveTextContent("Example Test School")
    expect(within(row(FIXTURE_SUBJECTS.urgent)).getByTestId("unread-dot")).toBeInTheDocument()
    expect(screen.getByTestId("crm-edits-note")).toHaveTextContent(EDITS_NOTE)
    expect(screen.getByRole("status")).toHaveTextContent(`Showing ${LIVE.cases.length} cases`)
    // Phone cards carry the same cases (CSS picks one; jsdom shows both).
    expect(within(screen.getByTestId("case-cards")).getAllByRole("listitem")).toHaveLength(LIVE.cases.length)
  })

  it("the subject links to the panel on the current query", () => {
    navigation.params = new URLSearchParams("status=open")
    render(<CasesScreen />)
    const link = within(row(FIXTURE_SUBJECTS.overdue)).getByRole("link")
    expect(link).toHaveAttribute("href", "/crm/cases?status=open&case=case-test-2")
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

  it("the priority picker changes the row and saves the edit", async () => {
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
      JSON.stringify({ [URGENT.id]: { status: { value: "waiting_on_them", from: "waiting_on_us" }, at: new Date(FIXED_NOW_MS).toISOString() } })
    )
    render(<CasesScreen />)
    expect(within(row(FIXTURE_SUBJECTS.urgent)).getByRole("combobox", { name: /^Status/ })).toHaveTextContent("Waiting on them")
  })

  it("filters from the URL; no match shows Clear filters, which clears them", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams("q=no-such-case&case=case-test-1")
    render(<CasesScreen />)
    expect(screen.getByText(NO_MATCH, { ignore: "[role=status]" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(NO_MATCH)
    expect(screen.queryByRole("table", { name: "Cases" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases?case=case-test-1", { scroll: false })
  })

  it("the status segment and the Waiting on you toggle write the URL", async () => {
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
  it("≥1280: opens beside the list with the case, pickers, edit note and sanitized thread", async () => {
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const panel = screen.getByTestId("case-panel")
    expect(panel.tagName).toBe("ASIDE")
    expect(within(panel).getByRole("heading", { level: 2, name: FIXTURE_SUBJECTS.urgent })).toBeInTheDocument()
    expect(panel).toHaveTextContent("Test Person Alpha")
    expect(panel).toHaveTextContent("Example Test School")
    expect(within(panel).getByRole("combobox", { name: /^Status/ })).toBeInTheDocument()
    expect(within(panel).getByRole("combobox", { name: /^Priority/ })).toBeInTheDocument()
    expect(within(panel).getByTestId("crm-edits-note")).toHaveTextContent(EDITS_NOTE)
    // The row is marked open and the table drops to its essentials.
    expect(row(FIXTURE_SUBJECTS.urgent)).toHaveAttribute("data-open")
    expect(within(table()).queryByRole("columnheader", { name: "Priority" })).not.toBeInTheDocument()

    const thread = await within(panel).findByRole("list", { name: "Thread" })
    const html = within(thread).getByTestId("message-html")
    expect(html).toHaveTextContent("Hello from the test inbox")
    expect(html.querySelector("script")).toBeNull()
    expect(html.innerHTML).not.toContain("__crmPwned")
    expect(html.querySelector("img")!.getAttribute("onerror")).toBeNull()
    expect(within(html).getByText("bad link")).not.toHaveAttribute("href")
    expect(within(html).getByRole("link", { name: "safe link" })).toHaveAttribute("rel", "noopener noreferrer")
    // No HTML: the plain text, kept as written.
    const text = within(thread).getByTestId("message-text")
    expect(text.tagName).toBe("PRE")
    expect(text).toHaveClass("whitespace-pre-wrap")
    expect(within(thread).getByText("screenshot.png")).toBeInTheDocument()
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

  it("Esc closes the docked panel", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    await user.keyboard("{Escape}")
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases", { scroll: false })
  })

  it("<1280: opens as a sheet dialog named by the subject", async () => {
    stubViewport({ desktop: false })
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    render(<CasesScreen />)
    const sheet = await screen.findByRole("dialog", { name: FIXTURE_SUBJECTS.urgent })
    expect(within(sheet).getByRole("button", { name: "Close case" })).toHaveClass("max-xl:size-11!")
    expect(within(sheet).getByTestId("crm-edits-note")).toBeInTheDocument()
    // The list keeps every column; the modal sheet floats over it (and hides it from readers).
    const list = screen.getByRole("table", { name: "Cases", hidden: true })
    expect(within(list).getByRole("columnheader", { name: "Priority", hidden: true })).toBeInTheDocument()
  })

  it("an id that is not in the inbox says so", () => {
    navigation.params = new URLSearchParams("case=case-gone")
    render(<CasesScreen />)
    expect(within(screen.getByTestId("case-panel")).getByRole("heading", { name: "Case not found" })).toBeInTheDocument()
  })

  it("a 401 while reading the thread says the session expired", async () => {
    setCrmSummaryForTest(LIVE)
    navigation.params = new URLSearchParams(`case=${URGENT.id}`)
    const { configureCrmSummary } = await import("@/hooks/use-crm-summary")
    configureCrmSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: async () => ({ kind: "ok", data: LIVE }),
      threadFetcher: async () => ({ kind: "unauthorized" }),
    })
    render(<CasesScreen />)
    expect(await within(screen.getByTestId("case-panel")).findByTestId("crm-session-expired")).toBeInTheDocument()
  })
})

describe("Cases: states", () => {
  it("not connected: the Not connected panel, no table, no filters", () => {
    setCrmSummaryForTest({ ...LIVE, status: "not_connected", cases: [], accounts: [], recentActivity: [], counts: null })
    render(<CasesScreen />)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent("Not connected")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
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
