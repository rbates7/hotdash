import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { subscriberListState } from "@/lib/stripe-subscribers"
import { SubscriberListPanel } from "@/components/metrics/subscriber-list-panel"
import { CHURNED_ROWS, NEW_ROWS, subscriberList } from "@/test/stripe-fixture"

const TZ = "America/Chicago"
const live = (list: "new" | "churned", status: "connected" | "stale" = "connected", rows = list === "new" ? NEW_ROWS : CHURNED_ROWS, total?: number) =>
  subscriberListState({ phase: "ready", list: subscriberList(list, status, rows, total) })

describe("SubscriberListPanel", () => {
  it("not connected: the shared panel", () => {
    render(<SubscriberListPanel list="new" state={{ kind: "not_connected" }} timeZone={TZ} />)
    expect(screen.getByRole("region", { name: "New subscribers: not connected" })).toBeInTheDocument()
  })
  it("connecting: skeleton and Connecting…", () => {
    render(<SubscriberListPanel list="new" state={{ kind: "loading", connecting: true }} timeZone={TZ} />)
    expect(screen.getByRole("status", { name: "New subscribers connecting" })).toBeInTheDocument()
    expect(screen.getByTestId("connecting")).toHaveTextContent("Connecting…")
  })
  it("error: a neutral retrying line, no figure, never Not connected", () => {
    render(<SubscriberListPanel list="new" state={{ kind: "error" }} timeZone={TZ} />)
    expect(screen.getByTestId("subscriber-list-error")).toHaveTextContent("Couldn\u2019t load subscribers. Retrying\u2026")
    expect(screen.queryByText("Not connected")).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
  })
  it("session expired: sign in again, never Not connected", () => {
    render(<SubscriberListPanel list="churned" state={{ kind: "session_expired" }} timeZone={TZ} />)
    const r = screen.getByRole("region", { name: "Churned subscribers: session expired" })
    expect(r).toHaveTextContent("Your session expired.")
    expect(within(r).getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", expect.stringMatching(/^\/unlock\?next=/))
    expect(screen.queryByText("Not connected")).toBeNull()
  })
  it("empty copy per list", () => {
    const { unmount } = render(<SubscriberListPanel list="new" state={live("new", "connected", [], 0)} timeZone={TZ} />)
    expect(screen.getByTestId("subscriber-list-empty")).toHaveTextContent("No new subscribers in this window")
    unmount()
    render(<SubscriberListPanel list="churned" state={live("churned", "connected", [], 0)} timeZone={TZ} />)
    expect(screen.getByTestId("subscriber-list-empty")).toHaveTextContent("No churned subscribers in this window")
  })
  it("rows: name or email or an em dash; count shows newest of total", () => {
    render(<SubscriberListPanel list="new" state={live("new", "connected", NEW_ROWS, 134)} timeZone={TZ} />)
    const table = screen.getByRole("table", { name: "New subscribers" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("Avery Coachavery@example.com")
    expect(rows[1]).toHaveTextContent("no-name@example.com")
    expect(rows[2]).toHaveTextContent("\u2014")
    expect(screen.getByTestId("subscriber-list-count")).toHaveTextContent("Newest 3 of 134")
    expect(screen.queryByTestId("stale-badge")).toBeNull()
  })
  it("stale: Last updated plus an amber Stale badge; churned reasons in words", () => {
    render(<SubscriberListPanel list="churned" state={live("churned", "stale")} timeZone={TZ} />)
    expect(screen.getByTestId("subscriber-list-updated")).toHaveTextContent("Last updated Tue, Oct 13 · 9:41 AM CDT")
    expect(screen.getByTestId("stale-badge")).toHaveTextContent("Stale")
    expect(screen.getByTestId("stale-badge").className).toMatch(/text-warning-text/)
    expect(screen.getByRole("table", { name: "Churned subscribers" })).toHaveTextContent("Canceled by customer")
  })
})
