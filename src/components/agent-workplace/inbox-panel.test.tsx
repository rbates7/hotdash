import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { InboxResponse } from "@/lib/inbox-sources"
import { configureInbox } from "@/hooks/use-inbox"
import { connectingInbox, emptyInbox, liveInbox, notConnectedInbox, staleInbox } from "@/test/inbox-fixture"
import { InboxPanel } from "@/components/agent-workplace/inbox-panel"

const NOW = Date.now()

function renderWith(inbox: InboxResponse | Error) {
  configureInbox({ fetcher: () => (inbox instanceof Error ? Promise.reject(inbox) : Promise.resolve(inbox)) })
  return render(<InboxPanel />)
}
const panel = () => screen.getByTestId("inbox-panel")

afterEach(() => configureInbox({}))

describe("InboxPanel (live /api/inbox)", () => {
  it("connected: the live rows, each opening its PR or Sentry issue", async () => {
    renderWith(liveInbox(NOW))
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "connected"))
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
    expect(screen.getByRole("link", { name: /#912 Roster import/ })).toHaveAttribute(
      "href",
      "https://github.com/rbates7/hotdash/pull/912"
    )
    expect(screen.getByText("Gmail: Not connected")).toBeInTheDocument()
    // None of the design mock's sample rows.
    expect(screen.queryByText(/Agent blocked|Daily standup summary/)).not.toBeInTheDocument()
  })

  it("stale: keeps the rows and says when they were last updated", async () => {
    renderWith(staleInbox(NOW))
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "stale"))
    expect(screen.getByTestId("inbox-updated")).toHaveTextContent(/^Last updated /)
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
  })

  it("connecting: placeholders, no rows", async () => {
    renderWith(connectingInbox(NOW))
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "connecting"))
    expect(screen.getByText("Connecting to GitHub and Sentry…")).toBeInTheDocument()
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })

  it("empty: a clean empty state", async () => {
    renderWith(emptyInbox(NOW))
    await waitFor(() => expect(screen.getByTestId("inbox-empty")).toHaveTextContent("Nothing in the Inbox."))
  })

  it("not connected, and our endpoint failing, read Not connected — never an error or sample rows", async () => {
    for (const inbox of [notConnectedInbox(NOW), new Error("boom")]) {
      const { unmount } = renderWith(inbox)
      await waitFor(() => expect(screen.getByTestId("inbox-not-connected")).toHaveTextContent("Not connected"))
      expect(screen.queryByText("boom")).not.toBeInTheDocument()
      expect(screen.queryAllByRole("listitem")).toHaveLength(0)
      unmount()
    }
  })
})
