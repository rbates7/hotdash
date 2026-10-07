"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentsRoster } from "@/components/agent-workplace/agents-roster"
import { AutopilotsPanel } from "@/components/agent-workplace/autopilots-panel"
import { BacklogPanel } from "@/components/agent-workplace/backlog-panel"
import { ChatDoor } from "@/components/agent-workplace/chat-door"
import { InboxPanel } from "@/components/agent-workplace/inbox-panel"
import { IssuesBoard } from "@/components/agent-workplace/issues-board"
import { TicketView } from "@/components/agent-workplace/ticket-view"

/**
 * The locked tab set (Issues, Agents, Chat, Autopilots, Inbox) plus Backlog,
 * which already shipped as the place sprints start and finish.
 */
export const WORKPLACE_TABS = [
  { value: "issues", label: "Issues" },
  { value: "backlog", label: "Backlog" },
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

export function WorkplaceTabs() {
  const router = useRouter()
  const params = useSearchParams()

  const requested = params.get("tab")
  const tab: WorkplaceTab = isTab(requested) ? requested : DEFAULT_TAB
  const issueKey = params.get("issue")

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
      <TabsList
        variant="line"
        className="border-border w-full justify-start overflow-x-auto rounded-none border-b pb-[5px]"
      >
        {WORKPLACE_TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="text-label flex-none px-3.5 py-1.5 font-medium tracking-tight"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="issues">
        <IssuesBoard onOpenIssue={openIssue} />
      </TabsContent>
      <TabsContent value="backlog">
        <BacklogPanel onOpenIssue={openIssue} />
      </TabsContent>
      <TabsContent value="agents">
        <AgentsRoster onOpenIssue={openIssue} />
      </TabsContent>
      <TabsContent value="chat">
        <ChatDoor onOpenAgents={() => setParam({ tab: "agents" })} />
      </TabsContent>
      <TabsContent value="autopilots">
        <AutopilotsPanel />
      </TabsContent>
      <TabsContent value="inbox">
        <InboxPanel onOpenIssue={openIssue} />
      </TabsContent>
    </Tabs>
  )
}
