import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GMAIL_NOT_CONNECTED, gmailConnecting } from "@/lib/crm/gmail-summary"
import { CRM_CONNECTING, CRM_NOT_CONNECTED, type CrmFetchResult, type CrmSummary } from "@/lib/crm/case-view"
import { configureCrmSummary } from "@/hooks/use-crm-summary"
import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { crmSummaryFromGmail, setCrmLoadingForTest, setCrmSummaryForTest, setCrmUnauthorizedForTest } from "@/test/crm"
import { liveGmailSummary, setGmailLoadingForTest, setGmailSummaryForTest } from "@/test/gmail"
import { CLEAR_COPY } from "@/components/persistence-note"
import { STORAGE_KEY, CrmProvider, initialState, reducer, saveState } from "@/components/crm/crm-store"
import { CRM_MENU_LABEL, GMAIL_CONNECT } from "@/components/crm/crm-header-menu"
import { CONNECTING_LEDE, CrmShell, EXPIRED_LEDE, LEDE, expiredLede, liveLede, loadingLede } from "@/components/crm/crm-shell"
import { GMAIL_HINT, GMAIL_PANEL_TITLES } from "@/components/crm/gmail-not-connected"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import { ContactNewDialog, NEW_CONTACT_LIVE, NEW_CONTACT_PENDING } from "@/components/crm/contact-dialogs"
import {
  GMAIL_CONNECTING_LABEL,
  GMAIL_LIVE_LABEL,
  GMAIL_NOT_CONNECTED_LABEL,
  GMAIL_READ_ONLY_NOTE,
} from "@/components/crm/crm-source-badge"
import { OverviewScreen } from "@/components/crm/overview-screen"
import { TriageScreen } from "@/components/crm/triage-screen"

/*
 * The CRM shell and screens across Gmail's states. The header menu and
 * Contacts / Triage read develop's store (`useGmailFeed`, the route's older
 * fields); the rebuilt Overview reads `useCrmSummary` (Hill's list). Both
 * read /api/crm/gmail, so each test puts both in the same state.
 */

const NOW = FIXED_NOW_MS

const route = vi.hoisted(() => ({ pathname: "/crm" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => route.pathname,
}))

function renderCrm(ui: React.ReactNode) {
  return render(
    <CrmProvider nowMs={NOW}>
      <CrmShell>{ui}</CrmShell>
    </CrmProvider>
  )
}

const header = () => screen.getByRole("heading", { level: 1, name: "CRM" }).closest("header")!
const counts = () => screen.getAllByTestId("crm-count")

/** Open the header's ⋯ menu; Gmail's state and the storage note live in it. */
async function openMenu() {
  await userEvent.click(within(header()).getByRole("button", { name: CRM_MENU_LABEL }))
  return screen.findByTestId("crm-header-menu")
}

beforeEach(() => {
  navigation.params = new URLSearchParams()
  route.pathname = "/crm"
})

describe("CRM with Gmail not connected", () => {
  it("every tile is Not connected and no count reads 0; the menu says 'Gmail not connected' with Connect…", async () => {
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    // Nothing but the title, the finder and ⋯ in the header row.
    expect(within(header()).queryByTestId("crm-source")).not.toBeInTheDocument()
    expect(within(header()).queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(counts()).toHaveLength(6)
    for (const count of counts()) {
      expect(within(count).getByTestId("not-connected")).toHaveTextContent("Not connected")
      expect(count.querySelector(".tabular-nums")).toBeNull()
    }
    const panels = screen.getAllByTestId("crm-not-connected")
    expect(panels).toHaveLength(2)
    for (const panel of panels) expect(panel).toHaveTextContent(GMAIL_HINT)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)

    const menu = await openMenu()
    const source = within(menu).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_NOT_CONNECTED_LABEL)
    expect(source).toHaveAttribute("data-source", "not_connected")
    expect(within(menu).getByRole("menuitem", { name: GMAIL_CONNECT })).toHaveAttribute("href", "/settings#connected-data")
    expect(within(menu).getByTestId("persistence-note")).toHaveTextContent("Edits save in this browser")
    expect(within(menu).getByRole("menuitem", { name: CLEAR_COPY.button })).toBeInTheDocument()
  })

  it.each([
    ["Contacts", <ContactsScreen key="contacts" />, GMAIL_PANEL_TITLES.contacts],
    ["Triage", <TriageScreen key="triage" />, GMAIL_PANEL_TITLES.triage],
  ])("%s shows its own panel title", (_name, ui, title) => {
    renderCrm(ui)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(title)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(GMAIL_HINT)
  })
})

describe("CRM while Gmail is loading", () => {
  it("shows skeletons and Connecting…, never rows that then swap", async () => {
    setGmailLoadingForTest()
    setCrmLoadingForTest()
    renderCrm(<OverviewScreen />)
    for (const badge of screen.getAllByTestId("crm-connecting")) expect(badge).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.getByTestId("crm-live-region")).toHaveAttribute("role", "status")
    expect(screen.getByTestId("crm-live-region")).toHaveTextContent("Connecting")
    const menu = await openMenu()
    expect(within(menu).queryByTestId("crm-source")).not.toBeInTheDocument()
  })
})

describe("CRM while Gmail is connecting (first sync on the server)", () => {
  it("says Connecting…, keeps the skeletons, and shows no panel, rows or Sample tag", async () => {
    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    renderCrm(<OverviewScreen />)
    expect(screen.getAllByTestId("crm-connecting").length).toBeGreaterThanOrEqual(6)
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    const source = within(await openMenu()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_CONNECTING_LABEL)
    expect(source).toHaveAttribute("data-source", "connecting")
    expect(source).toHaveAttribute("aria-busy", "true")
  })

  it("Connecting… on every screen: skeletons, never the Not connected panel, even with the founder's contacts saved", () => {
    saveState(
      window.localStorage,
      reducer(initialState(NOW), {
        type: "add-contact",
        input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes" },
        at: new Date(NOW).toISOString(),
      })
    )
    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    for (const ui of [<OverviewScreen key="o" />, <ContactsScreen key="p" />, <TriageScreen key="t" />]) {
      const { unmount } = renderCrm(ui)
      expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
      expect(screen.queryByText("Pat Reyes")).not.toBeInTheDocument()
      unmount()
    }
  })

  it("Clear my entries is off, the lede is the connecting one, and there is no triage count", async () => {
    setGmailSummaryForTest(GMAIL_NOT_CONNECTED)
    const first = renderCrm(<OverviewScreen />)
    expect(within(await openMenu()).getByRole("menuitem", { name: CLEAR_COPY.button })).toBeInTheDocument()
    first.unmount()

    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: "Triage" })).toBeInTheDocument()
    expect(screen.queryByText(LEDE)).not.toBeInTheDocument()
    expect(within(header()).getByText(CONNECTING_LEDE)).toBeInTheDocument()
    const menu = await openMenu()
    expect(within(menu).getByRole("menuitem", { name: CLEAR_COPY.button })).toHaveAttribute("aria-disabled", "true")
    expect(screen.queryByRole("button", { name: /Reset/ })).not.toBeInTheDocument()
  })
})

describe("section subtitles while loading or signed out", () => {
  it("name what each section lists", () => {
    expect(loadingLede("/crm")).toBe(CONNECTING_LEDE)
    expect(loadingLede("/crm/cases")).toBe("Loading your cases…")
    expect(loadingLede("/crm/contacts")).toBe("Loading your contacts…")
    expect(loadingLede("/crm/triage")).toBe("Loading triage…")
    expect(loadingLede("/crm/accounts")).toBe("Loading your accounts…")
    expect(expiredLede("/crm")).toBe(EXPIRED_LEDE)
    expect(expiredLede("/crm/contacts")).toBe("Sign in again to see your contacts")
    expect(expiredLede("/crm/triage")).toBe("Sign in again to see triage")
  })
})

describe("CRM with the login session expired (401)", () => {
  it("says the session expired, not Not connected, in the menu and every tile", async () => {
    setCrmUnauthorizedForTest()
    renderCrm(<OverviewScreen />)
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByTestId("not-connected")).not.toBeInTheDocument()
    expect(screen.getAllByTestId("crm-session-expired")).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: "Sign in again" })[0]).toHaveAttribute("href", "/unlock?next=%2Fcrm")
    expect(screen.getByTestId("crm-live-region")).toHaveTextContent("Your session expired.")
    const source = within(await openMenu()).getByTestId("crm-source")
    expect(source).toHaveAttribute("data-source", "unauthorized")
    expect(source).toHaveTextContent("Session expired")
  })

  it("the subtitle asks to sign in again instead of 'once Gmail is connected'", () => {
    setCrmUnauthorizedForTest()
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(EXPIRED_LEDE)).toBeInTheDocument()
    expect(screen.queryByText(LEDE)).not.toBeInTheDocument()
  })
})

describe("CRM live from Gmail", () => {
  const LIVE = liveGmailSummary(NOW)
  const CRM = crmSummaryFromGmail(LIVE, NOW)
  const live = () => {
    setGmailSummaryForTest(LIVE)
    setCrmSummaryForTest(CRM)
  }

  it("shows the inbox's counts, says where they come from, and drops every sample label", async () => {
    live()
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(liveLede("info@chlkapp.com"))).toBeInTheDocument()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(screen.getByRole("link", { name: `${CRM.counts.open} Open` })).toHaveAttribute("href", "/crm/cases")
    expect(screen.getByRole("link", { name: /2 conversations from unknown senders/ })).toBeInTheDocument()
    const menu = await openMenu()
    const source = within(menu).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_LIVE_LABEL)
    expect(source).toHaveAttribute("data-source", "gmail")
    expect(within(menu).queryByRole("menuitem", { name: GMAIL_CONNECT })).not.toBeInTheDocument()
    // Overview, Cases and Accounts keep status/priority edits in this browser.
    expect(within(menu).queryByTestId("crm-read-only")).not.toBeInTheDocument()
    expect(within(menu).getByTestId("persistence-note")).toHaveTextContent("Edits save in this browser")
  })

  it("lists the triage threads from the inbox", () => {
    live()
    renderCrm(<TriageScreen />)
    expect(screen.getByText("Sam Patel")).toBeInTheDocument()
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument()
    expect(screen.queryByText("Vendor News")).not.toBeInTheDocument()
  })

  it("the menu's storage line on Contacts / Triage while live: edits there are not kept", async () => {
    live()
    route.pathname = "/crm/triage"
    renderCrm(<TriageScreen />)
    expect(within(await openMenu()).getByTestId("crm-read-only")).toHaveTextContent(GMAIL_READ_ONLY_NOTE)
  })

  it("stale: the last threads, with when they were last updated", async () => {
    setGmailSummaryForTest({ ...LIVE, status: "stale" })
    setCrmSummaryForTest({ ...CRM, status: "stale" })
    renderCrm(<OverviewScreen />)
    expect(screen.getByTestId("crm-stale")).toHaveTextContent(/^Last updated /)
    expect(screen.getByRole("link", { name: `${CRM.counts.open} Open` })).toBeInTheDocument()
    const source = within(await openMenu()).getByTestId("crm-source")
    expect(source).toHaveTextContent(/^Last updated /)
    expect(source).toHaveAttribute("data-stale")
  })

  it("an edit applies to the inbox copy in memory and is never written over the founder's saved copy", async () => {
    window.localStorage.setItem(STORAGE_KEY, "untouched")
    live()
    renderCrm(<TriageScreen />)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(2)
    await userEvent.click(screen.getAllByRole("button", { name: "Promote to case" })[0]!)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("untouched")
  })

  it("a newer sync replaces the copy, and the edits made on the old one", async () => {
    let answer!: (summary: typeof LIVE) => void
    configureGmailSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<TriageScreen />)
    await userEvent.click(screen.getAllByRole("button", { name: "Promote to case" })[0]!)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(1)

    const newer = { ...LIVE, lastSyncedAt: new Date(NOW).toISOString() }
    await act(async () => answer(newer))
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(2)
  })

  it("Gmail disconnected later: the counts go, the panels show, and the zeros are never shown", async () => {
    let answer!: (r: CrmFetchResult<CrmSummary>) => void
    configureCrmSummary({
      initial: { phase: "ready", summary: CRM },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: `${CRM.counts.open} Open` })).toBeInTheDocument()
    await act(async () => answer({ kind: "ok", data: CRM_NOT_CONNECTED }))
    expect(screen.queryByRole("link", { name: /Open$/ })).not.toBeInTheDocument()
    expect(screen.getAllByTestId("crm-not-connected")).toHaveLength(2)
    for (const count of counts()) expect(count.querySelector(".tabular-nums")).toBeNull()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
  })
})

describe("New contact dialog names Gmail as pending only while it is not live (item 10)", () => {
  async function openDialog() {
    const user = userEvent.setup()
    render(
      <CrmProvider nowMs={NOW}>
        <ContactNewDialog />
      </CrmProvider>
    )
    await user.click(screen.getByRole("button", { name: "New contact" }))
    return screen.findByRole("dialog", { name: "New contact" })
  }

  it("Gmail live: no 'once Gmail is connected'", async () => {
    setGmailSummaryForTest(liveGmailSummary(NOW))
    const dialog = await openDialog()
    expect(dialog).toHaveAccessibleDescription(NEW_CONTACT_LIVE)
    expect(dialog).not.toHaveTextContent(/once Gmail is connected/)
  })

  it("Gmail not connected: says Gmail is still to come", async () => {
    const dialog = await openDialog()
    expect(dialog).toHaveAccessibleDescription(NEW_CONTACT_PENDING)
  })
})
