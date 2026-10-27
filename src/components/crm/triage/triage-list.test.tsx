import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TriageList, type TriageListThread } from "@/components/crm/triage/triage-list"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

/** Test-only rows: two threads from Ava, one each from Ben and Cal. */
const THREADS: TriageListThread[] = [
  thread("t-1", "ava@school.org", "Ava Cole", "Roster import"),
  thread("t-2", "ben@club.org", "Ben Diaz", "Invoice question"),
  thread("t-3", "ava@school.org", "Ava Cole", "Second roster"),
  thread("t-4", "cal@team.org", null, "Hello"),
]

function thread(id: string, email: string, name: string | null, subject: string): TriageListThread {
  return {
    gmailThreadId: id,
    senderEmail: email,
    senderName: name,
    subject,
    snippet: null,
    messageCount: 1,
    latestLabel: "1h ago",
  }
}

type Body = { gmailThreadId: string; action: string; ignoreSenderAlways?: boolean }

/** `/api/crm/triage/resolve`, answering 500 for the thread ids in `failing`. */
function mockResolve(failing: string[] = []) {
  const calls: Body[] = []
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Body
    calls.push(body)
    const fail = failing.includes(body.gmailThreadId)
    return new Response(JSON.stringify(fail ? { error: "Database timed out." } : { caseId: null }), {
      status: fail ? 500 : 200,
      headers: { "Content-Type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return calls
}

const checkbox = (name: RegExp | string) => screen.getByRole("checkbox", { name })
const selectAll = () => checkbox("Select all")
const bar = () => screen.getByRole("region", { name: "Bulk triage" })
const bulkButton = (name: string) => within(bar()).getByRole("button", { name })
const status = () =>
  screen.getAllByRole("status").find((el) => el.getAttribute("data-slot") === "triage-bulk-status")!

beforeEach(() => refresh.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe("Triage bulk select", () => {
  it("each card has a named checkbox; selecting one shows the sticky bar and its count", async () => {
    const user = userEvent.setup()
    render(<TriageList threads={THREADS} />)
    expect(screen.getAllByRole("checkbox", { name: /^Select thread from / })).toHaveLength(4)
    expect(bar()).toHaveAttribute("data-selected", "false")
    expect(within(bar()).queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument()

    await user.click(checkbox("Select thread from Ava Cole: Roster import"))
    expect(checkbox("Select thread from Ava Cole: Roster import")).toBeChecked()
    expect(bar()).toHaveAttribute("data-selected", "true")
    expect(bar().className).toContain("sticky")
    expect(within(bar()).getByText("1 selected")).toHaveAttribute("aria-live", "polite")
    expect(selectAll()).toBePartiallyChecked()
    // Link contact is a per-sender call: never in the bar.
    expect(within(bar()).queryByRole("button", { name: /Link contact/ })).not.toBeInTheDocument()
    // A sender with no name is named by email.
    expect(checkbox("Select thread from cal@team.org: Hello")).not.toBeChecked()
  })

  it("Select all is tri-state, selects every card, and Clear selection empties it", async () => {
    const user = userEvent.setup()
    render(<TriageList threads={THREADS} />)
    await user.click(selectAll())
    expect(selectAll()).toBeChecked()
    expect(selectAll()).not.toBePartiallyChecked()
    expect(within(bar()).getByText("4 selected")).toBeInTheDocument()
    for (const box of screen.getAllByRole("checkbox", { name: /^Select thread from / })) {
      expect(box).toBeChecked()
    }

    await user.click(checkbox("Select thread from Ben Diaz: Invoice question"))
    expect(selectAll()).toBePartiallyChecked()

    await user.click(bulkButton("Clear selection"))
    expect(selectAll()).not.toBeChecked()
    expect(selectAll()).not.toBePartiallyChecked()
    expect(selectAll()).toHaveFocus()
    expect(within(bar()).queryByText(/selected/)).not.toBeInTheDocument()

    await user.click(selectAll())
    await user.click(selectAll())
    expect(selectAll()).not.toBeChecked()
  })

  it("bulk Ignore resolves each selected thread, reports, clears the selection and refreshes", async () => {
    const user = userEvent.setup()
    const calls = mockResolve()
    render(<TriageList threads={THREADS} />)
    await user.click(checkbox(/Roster import/))
    await user.click(checkbox(/Invoice question/))
    await user.click(bulkButton("Ignore"))

    await waitFor(() => expect(status()).toHaveTextContent("Ignored 2 threads."))
    expect(calls).toEqual([
      { gmailThreadId: "t-1", action: "ignore" },
      { gmailThreadId: "t-2", action: "ignore" },
    ])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(selectAll()).not.toBeChecked()
    expect(selectAll()).not.toBePartiallyChecked()
  })

  it("bulk Promote runs once per sender (the server promotes all of a sender's threads)", async () => {
    const user = userEvent.setup()
    const calls = mockResolve()
    render(<TriageList threads={THREADS} />)
    await user.click(selectAll())
    await user.click(bulkButton("Promote to case"))

    await waitFor(() => expect(status()).toHaveTextContent("Promoted 4 threads to cases."))
    expect(calls.map((c) => c.gmailThreadId)).toEqual(["t-1", "t-2", "t-4"])
    expect(calls.every((c) => c.action === "promote")).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("a partial failure keeps only the failed cards selected and says how many failed", async () => {
    const user = userEvent.setup()
    mockResolve(["t-2"])
    render(<TriageList threads={THREADS} />)
    await user.click(selectAll())
    await user.click(bulkButton("Ignore"))

    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Ignored 3 threads. 1 thread failed and stays selected. Database timed out."
      )
    )
    expect(status()).toHaveAttribute("data-failed", "true")
    expect(checkbox(/Invoice question/)).toBeChecked()
    expect(checkbox(/Roster import/)).not.toBeChecked()
    expect(checkbox(/Second roster/)).not.toBeChecked()
    expect(within(bar()).getByText("1 selected")).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("a network error on one card does not drop the others", async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { gmailThreadId } = JSON.parse(String(init?.body)) as Body
        seen.push(gmailThreadId)
        if (gmailThreadId === "t-1") throw new TypeError("Failed to fetch")
        return Response.json({ caseId: null })
      })
    )
    render(<TriageList threads={THREADS} />)
    await user.click(checkbox(/Roster import/))
    await user.click(checkbox(/Hello/))
    await user.click(bulkButton("Ignore"))
    await waitFor(() => expect(status()).toHaveTextContent("1 thread failed"))
    expect(seen).toEqual(["t-1", "t-4"])
    expect(checkbox(/Roster import/)).toBeChecked()
    expect(checkbox(/Hello/)).not.toBeChecked()
  })

  it("Always ignore these senders confirms with the distinct sender count first", async () => {
    const user = userEvent.setup()
    const calls = mockResolve()
    render(<TriageList threads={THREADS} />)
    await user.click(checkbox(/Roster import/))
    await user.click(checkbox(/Second roster/))
    await user.click(checkbox(/Invoice question/))
    await user.click(bulkButton("Always ignore these senders"))

    const dialog = await screen.findByRole("dialog", { name: "Always ignore 2 senders?" })
    expect(within(dialog).getByRole("list", { name: "Senders to ignore" })).toHaveTextContent(
      "ava@school.orgben@club.org"
    )
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(calls).toHaveLength(0)
    expect(within(bar()).getByText("3 selected")).toBeInTheDocument()

    await user.click(bulkButton("Always ignore these senders"))
    const again = await screen.findByRole("dialog", { name: "Always ignore 2 senders?" })
    await user.click(within(again).getByRole("button", { name: "Always ignore 2 senders" }))
    await waitFor(() => expect(status()).toHaveTextContent("Always ignoring 2 senders."))
    expect(calls).toEqual([
      { gmailThreadId: "t-1", action: "ignore", ignoreSenderAlways: true },
      { gmailThreadId: "t-2", action: "ignore", ignoreSenderAlways: true },
    ])
  })

  it("Select all from <sender> in a card's menu selects every loaded card from that sender", async () => {
    const user = userEvent.setup()
    render(<TriageList threads={THREADS} />)
    const card = checkbox(/Roster import/).closest("[data-slot=triage-card]") as HTMLElement
    await user.click(within(card).getByRole("button", { name: "More actions" }))
    await user.click(await screen.findByRole("menuitem", { name: "Select all from ava@school.org" }))

    expect(checkbox(/Roster import/)).toBeChecked()
    expect(checkbox(/Second roster/)).toBeChecked()
    expect(checkbox(/Invoice question/)).not.toBeChecked()
    expect(within(bar()).getByText("2 selected")).toBeInTheDocument()
  })

  it("prunes selected ids that leave the list", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TriageList threads={THREADS} />)
    await user.click(selectAll())
    expect(within(bar()).getByText("4 selected")).toBeInTheDocument()

    rerender(<TriageList threads={THREADS.filter((t) => t.gmailThreadId !== "t-2")} />)
    expect(within(bar()).getByText("3 selected")).toBeInTheDocument()
    expect(selectAll()).toBeChecked()

    // The pruned id does not come back with the thread.
    rerender(<TriageList threads={THREADS} />)
    expect(checkbox(/Invoice question/)).not.toBeChecked()
    expect(within(bar()).getByText("3 selected")).toBeInTheDocument()
  })
})
