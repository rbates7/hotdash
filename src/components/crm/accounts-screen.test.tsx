import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CRM_NOT_CONNECTED } from "@/lib/crm/case-view"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import {
  FIXTURE_ACCOUNT,
  crmEmptySummary,
  crmFixtureSummary,
  setCrmLoadingForTest,
  setCrmSummaryForTest,
  setCrmUnauthorizedForTest,
} from "@/test/crm"
import { ACCOUNTS_PANEL_TITLE, AccountsScreen, NO_ACCOUNTS, NO_ACCOUNT_MATCH } from "@/components/crm/accounts-screen"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm/accounts",
}))

vi.mock("@/lib/clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clock")>()
  return { ...actual, now: () => new Date(FIXED_NOW_MS) }
})

const LIVE = crmFixtureSummary(FIXED_NOW_MS)
const SECOND = { id: "org-2", name: "second.example", domain: "second.example", contacts: [], openCases: 0, waitingOnUsCount: 0, lastActivityAt: null }

beforeEach(() => {
  navigation.params = new URLSearchParams()
  navigation.push.mockReset()
  setCrmSummaryForTest({ ...LIVE, accounts: [...LIVE.accounts, SECOND] })
})

describe("Accounts", () => {
  it("one row per account with Deke's columns Gmail can fill; rows are not links", () => {
    render(<AccountsScreen />)
    const table = screen.getByRole("table", { name: "Accounts" })
    const heads = within(table).getAllByRole("columnheader")
    expect(heads.map((h) => h.textContent)).toEqual(["Account", "Contacts", "Last activity", "Open"])
    // Last activity only from 1180; the table collapses to a list below 820.
    expect(heads[2]).toHaveClass("hidden", "min-[1180px]:table-cell")
    expect(table.parentElement?.parentElement).toHaveClass("max-[819px]:hidden")
    const row = within(table).getByRole("row", { name: new RegExp(FIXTURE_ACCOUNT.name) })
    expect(row).toHaveTextContent("Test Person Alpha, Test Person Bravo")
    expect(row).toHaveTextContent("2h ago")
    expect(within(table).queryAllByRole("link")).toHaveLength(0)
    const list = screen.getByTestId("account-list")
    expect(list).toHaveClass("min-[820px]:hidden")
    expect(within(list).queryAllByRole("link")).toHaveLength(0)
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(within(list).getByLabelText("3 open")).toBeInTheDocument()
  })

  it("the domain shows under the name only when it differs", () => {
    setCrmSummaryForTest({ ...LIVE, accounts: [{ ...LIVE.accounts[0]!, name: "Example School" }] })
    render(<AccountsScreen />)
    const row = within(screen.getByRole("table", { name: "Accounts" })).getByRole("row", { name: /Example School/ })
    expect(row).toHaveTextContent("Example Schoolexample.com")
  })

  it("search filters from ?q= and writes it after a pause", async () => {
    const user = userEvent.setup()
    navigation.params = new URLSearchParams("q=second")
    const { rerender } = render(<AccountsScreen />)
    expect(within(screen.getByRole("table", { name: "Accounts" })).getAllByRole("row")).toHaveLength(2)
    await user.clear(screen.getByRole("searchbox", { name: "Search accounts" }))
    await user.type(screen.getByRole("searchbox", { name: "Search accounts" }), "nomatch")
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/crm/accounts?q=nomatch", { scroll: false }))
    navigation.params = new URLSearchParams("q=nomatch")
    rerender(<AccountsScreen />)
    expect(screen.getByText(NO_ACCOUNT_MATCH, { ignore: "[role=status]" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear search" }))
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/crm/accounts", { scroll: false }))
  })

  it("states: not connected, connecting, unauthorized, empty", () => {
    setCrmSummaryForTest(CRM_NOT_CONNECTED)
    let view = render(<AccountsScreen />)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(ACCOUNTS_PANEL_TITLE)
    view.unmount()

    setCrmLoadingForTest()
    view = render(<AccountsScreen />)
    expect(screen.getByTestId("crm-connecting")).toHaveAttribute("aria-busy", "true")
    view.unmount()

    setCrmUnauthorizedForTest()
    view = render(<AccountsScreen />)
    expect(screen.getByTestId("crm-session-expired")).toBeInTheDocument()
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    view.unmount()

    setCrmSummaryForTest(crmEmptySummary(FIXED_NOW_MS))
    render(<AccountsScreen />)
    expect(screen.getByText(NO_ACCOUNTS)).toBeInTheDocument()
  })
})
