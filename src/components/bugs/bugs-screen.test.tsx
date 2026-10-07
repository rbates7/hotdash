import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { crashCount } from "@/lib/bugs"
import { formatRelative, todayIn } from "@/lib/clock"
import { buildIssues } from "@/lib/issues-fixture"
import { FIXED_NOW, FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  saveState,
} from "@/components/agent-workplace/issues-store"
import { TicketView } from "@/components/agent-workplace/ticket-view"
import { BACK_TO_BUGS, BugsScreen } from "@/components/bugs/bugs-screen"
import { EMPTY_BUGS, SEED_BUGS_NOTICE, bugHref } from "@/components/bugs/bugs-list"

function renderBugs(search = "", nowMs = FIXED_NOW_MS, extra?: React.ReactNode) {
  navigation.params = new URLSearchParams(search)
  navigation.push.mockReset()
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
  })

  it("shows the Workplace's bug-tagged tickets grouped by status, Done last", () => {
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
    renderBugs()
    const seed = buildIssues(FIXED_NOW)
    const crash = within(group("To Do")).getByRole("link", { name: /Crash opening/ })
    expect(within(crash).getByTestId("bug-tag")).toHaveTextContent("Bug · Crash")
    // The avatar's sr-only name plus the visible one.
    expect(within(crash).getAllByText("Yo-Yo").length).toBeGreaterThan(0)
    expect(within(crash).getByText("Urgent")).toBeInTheDocument()

    const coach = within(group("In Review")).getByRole("link", { name: /Route arrows/ })
    expect(within(coach).getByTestId("bug-tag")).toHaveTextContent("Bug · Coach-reported")

    // Age is `formatRelative(createdAt, nowMs)` in the default `ago` style
    // the ticket view uses: the expectation goes through the same helper.
    for (const key of ["CHLK-419", "CHLK-420", "CHLK-404", "CHLK-421"]) {
      const issue = seed.find((i) => i.key === key)!
      const row = within(list()).getByRole("link", { name: new RegExp(key) })
      expect(within(row).getByTestId("bug-age")).toHaveTextContent(
        formatRelative(Date.parse(issue.createdAt), FIXED_NOW_MS)
      )
    }
  })

  it("measures age from the page's instant, so late at night the day is still Central", () => {
    renderBugs("", LATE_EVENING_CT_MS)
    // CHLK-419 was created five hours before the instant (18:30 CT): still today.
    const issue = buildIssues(new Date(LATE_EVENING_CT_MS)).find((i) => i.key === "CHLK-419")!
    const row = within(list()).getByRole("link", { name: /CHLK-419/ })
    expect(within(row).getByTestId("bug-age")).toHaveTextContent(
      formatRelative(Date.parse(issue.createdAt), LATE_EVENING_CT_MS)
    )
    expect(within(row).getByTestId("bug-age")).not.toHaveTextContent("Yesterday")
  })

  it("a row deep-links to the same ticket, opened on this page", () => {
    renderBugs()
    const row = within(group("To Do")).getByRole("link", { name: /CHLK-419/ })
    expect(row).toHaveAttribute("href", bugHref("CHLK-419"))
    expect(bugHref("CHLK-419")).toBe("/bugs?issue=CHLK-419")
  })

  it("?issue= opens the Workplace's own ticket view with a way back to the list", async () => {
    const user = userEvent.setup()
    renderBugs("issue=CHLK-419")
    expect(screen.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Ticket properties" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Bug list" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: BACK_TO_BUGS }))
    expect(navigation.push).toHaveBeenCalledWith("/bugs", { scroll: false })
  })

  it("shows the sample-data notice on seed bugs", () => {
    renderBugs()
    const notice = within(list()).getByRole("note", { name: "Sample data" })
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveTextContent(SEED_BUGS_NOTICE)
  })

  it("hides the notice when every seed bug is untagged and a new ticket is tagged bug", () => {
    const state = initialState(FIXED_NOW)
    state.issues = state.issues.map((i) =>
      i.labels.includes("bug") ? { ...i, labels: i.labels.filter((l) => l !== "bug") } : i
    )
    const template = state.issues[0]
    state.issues.push({
      ...template,
      key: "CHLK-999",
      title: "A new live bug",
      labels: ["bug"],
      status: "todo",
    })
    saveState(window.localStorage, state)

    renderBugs()
    expect(within(list()).queryByRole("note", { name: "Sample data" })).not.toBeInTheDocument()
    expect(within(list()).getByRole("link", { name: /A new live bug/ })).toBeInTheDocument()
    expect(within(list()).queryByRole("link", { name: /CHLK-419/ })).not.toBeInTheDocument()
  })

  it("shows the crash card from the sample fixture, labelled as sample data", () => {
    renderBugs()
    const card = screen.getByRole("article", { name: "Crashes" })
    const { value, previous } = crashCount(todayIn(FIXED_NOW))
    expect(within(card).getByTestId("crash-count")).toHaveTextContent(String(value))
    expect(within(card).getByText(`−${previous - value} vs previous 7 days`)).toBeInTheDocument()
    expect(within(card).getByTestId("sample-data-tag")).toHaveTextContent("Sample data")
    expect(within(card).getByText(/Sentry not connected/)).toBeInTheDocument()
  })

  it("says 'No open bugs' when every bug is Done, and still lists the fixed ones", async () => {
    // A saved Workplace copy — under the Workplace's own key — with the bugs fixed.
    const state = initialState(FIXED_NOW)
    state.issues = state.issues.map((i) =>
      i.labels.includes("bug") ? { ...i, status: "done" as const } : i
    )
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
    renderBugs("", FIXED_NOW_MS, <TicketView issueKey="CHLK-419" onClose={() => {}} />)
    expect(within(group("To Do")).getByRole("link", { name: /CHLK-419/ })).toBeInTheDocument()
    expect(Object.keys(window.localStorage)).toEqual([])

    const props = screen.getByRole("complementary", { name: "Ticket properties" })
    await user.click(within(props).getByRole("button", { name: "To Do" }))
    await user.click(await screen.findByRole("button", { name: "Blocked" }))

    expect(within(list()).queryByRole("region", { name: "To Do" })).not.toBeInTheDocument()
    expect(within(group("Blocked")).getByRole("link", { name: /CHLK-419/ })).toBeInTheDocument()
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
    expect(saved.issues.find((i: { key: string }) => i.key === "CHLK-419").status).toBe("blocked")
  })

  it("untagging a bug on its ticket removes it from the list", async () => {
    const user = userEvent.setup()
    renderBugs("", FIXED_NOW_MS, <TicketView issueKey="CHLK-420" onClose={() => {}} />)
    expect(within(list()).getByRole("link", { name: /CHLK-420/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Untag bug" }))
    expect(within(list()).queryByRole("link", { name: /CHLK-420/ })).not.toBeInTheDocument()
    expect(within(list()).getByText(/2 open · 1 fixed/)).toBeInTheDocument()
  })
})
