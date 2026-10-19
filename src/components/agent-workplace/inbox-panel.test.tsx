import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { InboxResponse } from "@/lib/inbox-sources"
import { configureInbox } from "@/hooks/use-inbox"
import { connectingInbox, emptyInbox, liveInbox, mixedInbox, notConnectedInbox, staleInbox } from "@/test/inbox-fixture"
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
    expect(screen.getByTestId("inbox-updated")).toHaveTextContent(/^GitHub: Last updated .* · Sentry: Last updated /)
    expect(screen.queryByText(/earlier/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
  })

  it("mixed (GitHub live, Sentry stale): all rows, and Sentry's last sync is shown", async () => {
    renderWith(mixedInbox(NOW))
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "connected"))
    expect(screen.getByTestId("inbox-updated")).toHaveTextContent(/^Sentry: Last updated \w{3}, /)
    expect(screen.getByTestId("inbox-updated")).not.toHaveTextContent(/GitHub/)
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
  })

  it("the Inbox tab keeps informational rows (PR needs a fix, ongoing Sentry)", async () => {
    renderWith(liveInbox(NOW))
    expect(await screen.findByText("PR needs a fix · CI failing")).toBeInTheDocument()
    expect(screen.getByText("Error · Ongoing")).toBeInTheDocument()
  })

  it("connecting names only the sources that are connecting", async () => {
    const inbox = connectingInbox(NOW)
    renderWith({ ...inbox, sources: { ...inbox.sources, github: { status: "not_connected", fetchedAt: null } } })
    expect(await screen.findByText("Connecting to Sentry…")).toBeInTheDocument()
  })

  it("connecting: placeholders, no rows", async () => {
    renderWith(connectingInbox(NOW))
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "connecting"))
    expect(screen.getByText("Connecting to GitHub and Sentry…")).toBeInTheDocument()
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    // Said once, in the box: not again per source in the header.
    expect(screen.queryByText("GitHub: Connecting…")).not.toBeInTheDocument()
    expect(screen.queryByText("Sentry: Connecting…")).not.toBeInTheDocument()
    expect(screen.getAllByText(/Connecting/)).toHaveLength(1)
  })

  it("connecting with one source: the box names it once, and the other source's note stays", async () => {
    const inbox = connectingInbox(NOW)
    renderWith({ ...inbox, sources: { ...inbox.sources, github: { status: "not_connected", fetchedAt: null } } })
    expect(await screen.findByText("Connecting to Sentry…")).toBeInTheDocument()
    expect(screen.queryByText("Sentry: Connecting…")).not.toBeInTheDocument()
    expect(screen.getByText("GitHub: Not connected")).toBeInTheDocument()
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
