import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatRelative } from "@/lib/clock"
import { boardWithUserBugs, userBugIssues } from "@/test/bugs"
import { liveInbox, notConnectedInbox, connectingInbox, emptyInbox } from "@/test/inbox-fixture"
import { configureInbox } from "@/hooks/use-inbox"
import { FIXED_NOW, FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  saveState,
} from "@/components/agent-workplace/issues-store"
import { TicketView } from "@/components/agent-workplace/ticket-view"
import { IssuesBoard } from "@/components/agent-workplace/issues-board"
import { activeSprint, issuesInSprint } from "@/lib/issues"
import { bugs } from "@/lib/bugs"
import { BACK_TO_BUGS, BugsScreen } from "@/components/bugs/bugs-screen"
import { EMPTY_BUGS, EMPTY_BUGS_HINT, bugHref } from "@/components/bugs/bugs-list"
import { SENTRY_EMPTY } from "@/components/bugs/sentry-crashes"

// The shared router mock (src/test/setup.ts) plus `back`, which Back to
// Bugs uses when the ticket was opened from this list.
const back = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", async () => {
  const { navigation } = await import("@/test/setup")
  return {
    useRouter: () => ({ push: navigation.push, replace: navigation.push, back }),
    useSearchParams: () => navigation.params,
    usePathname: () => "/bugs",
  }
})

/** A saved Workplace copy: the seed board plus the founder's own bug tickets (CHLK-9xx). */
function saveUserBoard(nowMs = FIXED_NOW_MS) {
  const state = initialState(new Date(nowMs))
  state.issues = boardWithUserBugs(new Date(nowMs))
  state.nextKey = 922
  saveState(window.localStorage, state)
}

function renderBugs(search = "", nowMs = FIXED_NOW_MS, extra?: React.ReactNode) {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
  back.mockReset()
  return render(
    <IssuesProvider nowMs={nowMs}>
      <BugsScreen />
      {extra}
    </IssuesProvider>
  )
}

const list = () => screen.getByRole("region", { name: "Bug list" })
const group = (name: string) => within(list()).getByRole("region", { name })

describe("Bugs screen", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams()
    configureInbox({ fetcher: () => Promise.resolve(notConnectedInbox(FIXED_NOW_MS)) })
  })
  afterEach(() => configureInbox({}))

  it("shows the Workplace's bug-tagged tickets grouped by status, Done last", () => {
    saveUserBoard()
    renderBugs()
    const groups = within(list()).getAllByRole("heading", { level: 2 })
    expect(groups.map((h) => h.textContent)).toEqual(["To Do", "In Progress", "In Review", "Done"])

    expect(within(group("To Do")).getByRole("link", { name: /Crash opening a shared playbook on iPad/ })).toBeInTheDocument()
    expect(within(group("In Progress")).getByRole("link", { name: /Undo stack for iPad canvas/ })).toBeInTheDocument()
    expect(within(group("In Review")).getByRole("link", { name: /Route arrows vanish after undo/ })).toBeInTheDocument()
    expect(within(group("Done")).getByRole("link", { name: /Crash exporting a book to PDF/ })).toBeInTheDocument()
    // Not a bug, not here.
    expect(within(list()).queryByText("Copy-link expires after 7 days")).not.toBeInTheDocument()
    expect(within(list()).getByText(/3 open · 1 fixed/)).toBeInTheDocument()
  })

  it("shows each bug's source and its age from the shared clock helper", () => {
    saveUserBoard()
    renderBugs()
    const seed = userBugIssues(FIXED_NOW)
    const crash = within(group("To Do")).getByRole("link", { name: /Crash opening/ })
    expect(within(crash).getByTestId("bug-tag")).toHaveTextContent("Bug · Crash")
    // The avatar's sr-only name plus the visible one.
    expect(within(crash).getAllByText("Yo-Yo").length).toBeGreaterThan(0)
    expect(within(crash).getByText("Urgent")).toBeInTheDocument()

    const coach = within(group("In Review")).getByRole("link", { name: /Route arrows/ })
    expect(within(coach).getByTestId("bug-tag")).toHaveTextContent("Bug · Coach-reported")

    // Age is `formatRelative(createdAt, nowMs)` in the default `ago` style
    // the ticket view uses: the expectation goes through the same helper.
    for (const key of ["CHLK-919", "CHLK-920", "CHLK-904", "CHLK-921"]) {
      const issue = seed.find((i) => i.key === key)!
      const row = within(list()).getByRole("link", { name: new RegExp(key) })
      expect(within(row).getByTestId("bug-age")).toHaveTextContent(
        formatRelative(Date.parse(issue.createdAt), FIXED_NOW_MS)
      )
    }
  })

  it("measures age from the page's instant, so late at night the day is still Central", () => {
    saveUserBoard(LATE_EVENING_CT_MS)
    renderBugs("", LATE_EVENING_CT_MS)
    // CHLK-919 was created five hours before the instant (18:30 CT): still today.
    const issue = userBugIssues(new Date(LATE_EVENING_CT_MS)).find((i) => i.key === "CHLK-919")!
    const row = within(list()).getByRole("link", { name: /CHLK-919/ })
    expect(within(row).getByTestId("bug-age")).toHaveTextContent(
      formatRelative(Date.parse(issue.createdAt), LATE_EVENING_CT_MS)
    )
    expect(within(row).getByTestId("bug-age")).not.toHaveTextContent("Yesterday")
  })

  it("a row deep-links to the same ticket, opened on this page", () => {
    saveUserBoard()
    renderBugs()
    const row = within(group("To Do")).getByRole("link", { name: /CHLK-919/ })
    expect(row).toHaveAttribute("href", bugHref("CHLK-919"))
    expect(bugHref("CHLK-919")).toBe("/bugs?issue=CHLK-919")
  })

  it("?issue= opens the Workplace's own ticket view with a way back to the list", async () => {
    const user = userEvent.setup()
    saveUserBoard()
    renderBugs("issue=CHLK-919")
    expect(screen.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Ticket properties" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Bug list" })).not.toBeInTheDocument()

    // A deep link has no list behind it in history: Back pushes /bugs.
    await user.click(screen.getByRole("button", { name: BACK_TO_BUGS }))
    expect(navigation.push).toHaveBeenCalledWith("/bugs", { scroll: false })
    expect(back).not.toHaveBeenCalled()
  })

  it("B1: a ticket opened from the list goes back a history step, and starts at its own top", async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    saveUserBoard()
    const view = renderBugs()
    const row = within(group("To Do")).getByRole("link", { name: /CHLK-919/ })
    // Keep jsdom on the page; the open itself is the router's job.
    row.addEventListener("click", (e) => e.preventDefault())
    await user.click(row)

    navigation.params = new URLSearchParams("issue=CHLK-919")
    view.rerender(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <BugsScreen />
      </IssuesProvider>
    )
    expect(screen.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    await user.click(screen.getByRole("button", { name: BACK_TO_BUGS }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(navigation.push).not.toHaveBeenCalled()
    scrollTo.mockRestore()
  })

  it("a fresh board lists no bugs: the Workplace seed's bug tickets never show here, and nothing is labelled sample", () => {
    renderBugs()
    expect(screen.getByRole("status", { name: "Empty bug list" })).toHaveTextContent(EMPTY_BUGS)
    expect(screen.getByTestId("empty-bugs-hint")).toHaveTextContent(EMPTY_BUGS_HINT)
    expect(within(list()).queryAllByRole("link")).toHaveLength(0)
    expect(within(list()).getByText(/0 open · 0 fixed/)).toBeInTheDocument()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
  })

  it("lists a ticket the founder added and tagged bug, and still none of the seed's", () => {
    const state = initialState(FIXED_NOW)
    state.issues.push({ ...state.issues[0], key: "CHLK-999", title: "A new live bug", labels: ["bug"], status: "todo" })
    state.nextKey = 1000
    saveState(window.localStorage, state)

    renderBugs()
    expect(within(list()).getByRole("link", { name: /A new live bug/ })).toBeInTheDocument()
    expect(within(list()).getAllByRole("link")).toHaveLength(1)
    expect(within(list()).queryByRole("link", { name: /CHLK-419/ })).not.toBeInTheDocument()
  })

  it("the Agent Workplace board keeps its seed tickets, bug-tagged ones included, while Bugs lists none of them", () => {
    // PR 1 drops the seed from Bugs only; the board's seed stays until PR 2.
    const seed = initialState(FIXED_NOW)
    const sprint = activeSprint(seed.sprints)!
    const onBoard = issuesInSprint(seed.issues, sprint.id)
    expect(onBoard.length).toBeGreaterThan(5)
    const seedBugsOnBoard = bugs(onBoard)
    expect(seedBugsOnBoard.length).toBeGreaterThan(0)

    renderBugs(
      "",
      FIXED_NOW_MS,
      <section aria-label="Workplace board">
        <IssuesBoard onOpenIssue={() => {}} statusView="todo" onStatusViewChange={() => {}} />
      </section>
    )
    const board = screen.getByRole("region", { name: "Workplace board" })
    for (const issue of onBoard) expect(within(board).getAllByText(issue.key).length).toBeGreaterThan(0)
    for (const issue of seedBugsOnBoard) expect(within(board).getAllByText(issue.title).length).toBeGreaterThan(0)
    expect(within(list()).queryAllByRole("link")).toHaveLength(0)
  })

  it("Sentry: Not connected panel with no token, never a sample list", async () => {
    renderBugs()
    const panel = await screen.findByTestId("sentry-not-connected")
    expect(panel).toHaveAccessibleName("Crashes and errors from Sentry: not connected")
    expect(within(panel).getByText("Not connected")).toBeInTheDocument()
  })

  it("Sentry: Connecting… during the first sync, then its rows link out to Sentry", async () => {
    configureInbox({ fetcher: () => Promise.resolve(connectingInbox(FIXED_NOW_MS)) })
    const first = renderBugs()
    expect(await screen.findByLabelText("Connecting to Sentry")).toHaveAttribute("aria-busy", "true")
    first.unmount()

    configureInbox({ fetcher: () => Promise.resolve(liveInbox(FIXED_NOW_MS)) })
    renderBugs()
    const crashes = await screen.findByRole("region", { name: "Crashes and errors from Sentry" })
    const rows = await within(crashes).findAllByRole("link")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute("href", "https://chlk.sentry.io/issues/7001/")
    expect(rows[0]).toHaveAttribute("target", "_blank")
    expect(rows[0]).toHaveTextContent("Crash · New issue")
    expect(rows[0]).toHaveTextContent("CHLK-IOS-4F Crash opening a practice plan")
    // GitHub rows from the same Inbox never show on Bugs.
    expect(crashes).not.toHaveTextContent(/PR ready for review/)
  })

  it("Sentry connected with nothing open says so", async () => {
    configureInbox({ fetcher: () => Promise.resolve(emptyInbox(FIXED_NOW_MS)) })
    renderBugs()
    const crashes = await screen.findByRole("region", { name: "Crashes and errors from Sentry" })
    expect(await within(crashes).findByRole("status")).toHaveTextContent(SENTRY_EMPTY)
  })

  it("the crash card says Not connected: an em dash, no delta, no sample figure", () => {
    saveUserBoard()
    renderBugs()
    const card = screen.getByRole("article", { name: "Crashes: not connected" })
    expect(card).toHaveAttribute("data-source", "not_connected")
    const count = within(card).getByTestId("crash-count")
    // The dash is decoration; screen readers hear "No figure" (sr-only text, not an aria-label on a span).
    expect(count).toHaveTextContent("\u2014No figure")
    expect(within(count).getByText("\u2014")).toHaveAttribute("aria-hidden")
    expect(within(count).getByText("No figure")).toHaveClass("sr-only")
    expect(within(card).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(card).getByText("Not connected")).toBeInTheDocument()
    expect(within(card).getByText(/no figure until Sentry is connected/)).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/vs previous 7 days/)
  })

  it("says 'No open bugs' when every bug is Done, and still lists the fixed ones", async () => {
    // A saved Workplace copy — under the Workplace's own key — with the bugs fixed.
    const state = initialState(FIXED_NOW)
    state.issues = boardWithUserBugs(FIXED_NOW).map((i) =>
      i.labels.includes("bug") ? { ...i, status: "done" as const } : i
    )
    state.nextKey = 922
    saveState(window.localStorage, state)

    renderBugs()
    expect(await screen.findByRole("status", { name: "Empty bug list" })).toHaveTextContent(EMPTY_BUGS)
    expect(within(list()).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Done"])
    expect(within(group("Done")).getAllByRole("link")).toHaveLength(4)
    expect(within(list()).getByText(/0 open · 4 fixed/)).toBeInTheDocument()
  })

  it("is a view of the one store: a status edit on the ticket regroups the list, and the save lands under the Workplace key", async () => {
    const user = userEvent.setup()
    // The list and the Workplace ticket view side by side, in the same provider.
    saveUserBoard()
    renderBugs("", FIXED_NOW_MS, <TicketView issueKey="CHLK-919" onClose={() => {}} />)
    expect(within(group("To Do")).getByRole("link", { name: /CHLK-919/ })).toBeInTheDocument()
    expect(Object.keys(window.localStorage)).toEqual([STORAGE_KEY])

    const props = screen.getByRole("complementary", { name: "Ticket properties" })
    await user.click(within(props).getByRole("button", { name: "To Do" }))
    await user.click(await screen.findByRole("button", { name: "Blocked" }))

    expect(within(list()).queryByRole("region", { name: "To Do" })).not.toBeInTheDocument()
    expect(within(group("Blocked")).getByRole("link", { name: /CHLK-919/ })).toBeInTheDocument()
    // Blocked comes before Done; nothing else moved.
    expect(within(list()).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "In Progress",
      "In Review",
      "Blocked",
      "Done",
    ])

    // No store and no key of its own: the one write is the Workplace's.
    await act(async () => {})
    expect(Object.keys(window.localStorage)).toEqual([STORAGE_KEY])
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(saved.issues.find((i: { key: string }) => i.key === "CHLK-919").status).toBe("blocked")
  })

  it("untagging a bug on its ticket removes it from the list", async () => {
    const user = userEvent.setup()
    saveUserBoard()
    renderBugs("", FIXED_NOW_MS, <TicketView issueKey="CHLK-920" onClose={() => {}} />)
    expect(within(list()).getByRole("link", { name: /CHLK-920/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Untag bug" }))
    expect(within(list()).queryByRole("link", { name: /CHLK-920/ })).not.toBeInTheDocument()
    expect(within(list()).getByText(/2 open · 1 fixed/)).toBeInTheDocument()
  })
})
