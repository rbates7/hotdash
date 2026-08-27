"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BotIcon,
  InboxIcon,
  LayersIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MonitorIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IssuesBoard } from "@/components/agent-workplace/issues-board"
import { BacklogPanel } from "@/components/agent-workplace/backlog-panel"
import { TicketView } from "@/components/agent-workplace/ticket-view"

type TabDef = {
  value: string
  label: string
  icon: LucideIcon
  /** Set on tabs that are not built yet. */
  comingNext?: string
}

const TABS: TabDef[] = [
  { value: "issues", label: "Issues", icon: ListTodoIcon },
  { value: "backlog", label: "Backlog", icon: LayersIcon },
  {
    value: "agents",
    label: "Agents",
    icon: BotIcon,
    comingNext:
      "The Grok-boy roster — each agent's status, and the issue it is working right now.",
  },
  {
    value: "runtimes",
    label: "Runtimes",
    icon: MonitorIcon,
    comingNext:
      "Each agent's machine: online state, token usage, daily cost, and a way to replay a run.",
  },
  {
    value: "chat",
    label: "Chat",
    icon: MessageSquareIcon,
    comingNext:
      "One unified thread — ask the workspace a question, or start work without filing anything.",
  },
  {
    value: "autopilots",
    label: "Autopilot",
    icon: ZapIcon,
    comingNext:
      "Standups, audits and reports on a schedule, with nobody to remind.",
  },
  {
    value: "inbox",
    label: "Inbox",
    icon: InboxIcon,
    comingNext:
      "A ping when an agent needs a decision — not for every step it takes.",
  },
]

const DEFAULT_TAB = "issues"

function ComingNext({ tab }: { tab: TabDef }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-24 text-center">
      <tab.icon className="text-faint-foreground size-8" aria-hidden />
      <p className="text-body text-foreground font-medium">{tab.label}</p>
      <p className="text-caption max-w-sm text-balance">{tab.comingNext}</p>
    </div>
  )
}

export function WorkplaceTabs() {
  const router = useRouter()
  const params = useSearchParams()

  const requested = params.get("tab") ?? DEFAULT_TAB
  const tab = TABS.some((t) => t.value === requested) ? requested : DEFAULT_TAB
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
      router.push(`?${next.toString()}`, { scroll: false })
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
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="text-body gap-1.5 px-2.5 py-1.5"
          >
            <t.icon className="size-4" aria-hidden />
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
      {TABS.filter((t) => t.comingNext).map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <ComingNext tab={t} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
