"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import type { IssueStatus } from "@/lib/issues"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  WORKPLACE_TAB,
  WORKPLACE_TABS_LIST,
} from "@/components/agent-workplace/responsive"
import { AgentsRoster } from "@/components/agent-workplace/agents-roster"
import { AutopilotsPanel } from "@/components/agent-workplace/autopilots-panel"
import { BacklogPanel } from "@/components/agent-workplace/backlog-panel"
import { ChatDoor } from "@/components/agent-workplace/chat-door"
import { InboxPanel } from "@/components/agent-workplace/inbox-panel"
import { IssuesBoard } from "@/components/agent-workplace/issues-board"
import { WorkBoard } from "@/components/agent-workplace/work-board"
import { TicketView } from "@/components/agent-workplace/ticket-view"

/**
 * The locked tab set (Issues, Agents, Chat, Autopilots, Inbox) plus Backlog,
 * which already shipped as the place sprints start and finish.
 */
export const WORKPLACE_TABS = [
  { value: "issues", label: "Issues" },
  { value: "backlog", label: "Backlog" },
  { value: "workboard", label: "Work board" },
  { value: "agents", label: "Agents" },
  { value: "chat", label: "Chat" },
  { value: "autopilots", label: "Autopilots" },
  { value: "inbox", label: "Inbox" },
] as const

export type WorkplaceTab = (typeof WORKPLACE_TABS)[number]["value"]

const DEFAULT_TAB: WorkplaceTab = "issues"

function isTab(value: string | null): value is WorkplaceTab {
  return WORKPLACE_TABS.some((t) => t.value === value)
}

/** Pixels of tab bar left to scroll before an edge counts as "more this way". */
const EDGE_SLACK = 2

/**
 * Seven tabs do not fit at 390, so the tab bar scrolls sideways (it always
 * did). This makes that visible and keeps the active tab in view: a fade on
 * whichever edge has more tabs behind it, and the active tab scrolled into
 * the bar on load and on every change (URL, click or arrow keys). Only the
 * bar scrolls, never the page. The fades are decoration: pointer-events
 * none, aria-hidden, and the tabs keep their 44px targets and the tablist's
 * own keyboard and arrow navigation.
 */
export function TabBarScroller({ active, children }: { active: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)

  const list = React.useCallback(
    () => ref.current?.querySelector<HTMLElement>("[data-slot='tabs-list']") ?? null,
    []
  )

  // The fades follow the DOM's scroll position, so they are written to the
  // wrapper's data attributes (CSS shows them), not React state.
  const measure = React.useCallback(() => {
    const el = list()
    const box = ref.current
    if (!el || !box) return
    const max = el.scrollWidth - el.clientWidth
    box.toggleAttribute("data-fade-start", el.scrollLeft > EDGE_SLACK)
    box.toggleAttribute("data-fade-end", max - el.scrollLeft > EDGE_SLACK)
  }, [list])

  // Keep the active tab inside the bar, with room for the fade beside it.
  React.useLayoutEffect(() => {
    const el = list()
    const tabEl = el?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
    if (!el || !tabEl) return
    const pad = 32
    const left = tabEl.offsetLeft - el.offsetLeft
    const right = left + tabEl.offsetWidth
    let target = el.scrollLeft
    if (left - pad < el.scrollLeft) target = Math.max(0, left - pad)
    else if (right + pad > el.scrollLeft + el.clientWidth) target = right + pad - el.clientWidth
    if (target !== el.scrollLeft) el.scrollLeft = target
    measure()
  }, [active, list, measure])

  React.useEffect(() => {
    const el = list()
    if (!el) return
    measure()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [list, measure])

  return (
    <div
      ref={ref}
      className="group/tabbar relative min-w-0"
      data-testid="workplace-tab-bar"
    >
      {children}
      <span
        aria-hidden
        data-testid="tab-fade-start"
        className="from-background pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent opacity-0 transition-opacity group-data-[fade-start]/tabbar:opacity-100"
      />
      <span
        aria-hidden
        data-testid="tab-fade-end"
        className="from-background pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent opacity-0 transition-opacity group-data-[fade-end]/tabbar:opacity-100"
      />
    </div>
  )
}

export function WorkplaceTabs() {
  const router = useRouter()
  const params = useSearchParams()

  const requested = params.get("tab")
  const tab: WorkplaceTab = isTab(requested) ? requested : DEFAULT_TAB
  const issueKey = params.get("issue")
  const [statusView, setStatusView] = React.useState<IssueStatus>("todo")

  // Tab and open ticket live in the URL so both are linkable and the back
  // button steps through them.
  const setParam = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      const qs = next.toString()
      router.push(qs ? `?${qs}` : "?", { scroll: false })
    },
    [params, router]
  )

  const openIssue = React.useCallback(
    (key: string) => setParam({ issue: key }),
    [setParam]
  )
  const closeIssue = React.useCallback(
    () => setParam({ issue: null }),
    [setParam]
  )

  // A ticket takes over the whole surface, as it does in the reference design.
  if (issueKey) {
    return <TicketView issueKey={issueKey} onClose={closeIssue} />
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setParam({ tab: String(value), issue: null })}
      className="min-w-0 gap-4"
    >
      <TabBarScroller active={tab}>
        <TabsList variant="line" className={WORKPLACE_TABS_LIST}>
          {WORKPLACE_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={WORKPLACE_TAB}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </TabBarScroller>

      <TabsContent value="issues" className="min-w-0">
        <IssuesBoard
          onOpenIssue={openIssue}
          statusView={statusView}
          onStatusViewChange={setStatusView}
        />
      </TabsContent>
      <TabsContent value="backlog" className="min-w-0">
        <BacklogPanel onOpenIssue={openIssue} />
      </TabsContent>
      <TabsContent value="workboard" className="min-w-0">
        <WorkBoard />
      </TabsContent>
      <TabsContent value="agents" className="min-w-0">
        <AgentsRoster onOpenIssue={openIssue} />
      </TabsContent>
      <TabsContent value="chat" className="min-w-0">
        <ChatDoor onOpenAgents={() => setParam({ tab: "agents" })} />
      </TabsContent>
      <TabsContent value="autopilots" className="min-w-0">
        <AutopilotsPanel />
      </TabsContent>
      <TabsContent value="inbox" className="min-w-0">
        <InboxPanel />
      </TabsContent>
    </Tabs>
  )
}
