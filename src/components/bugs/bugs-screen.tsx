"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { useIssues } from "@/components/agent-workplace/issues-store"
import { TicketView } from "@/components/agent-workplace/ticket-view"
import { BugsList } from "@/components/bugs/bugs-list"
import { CrashCountCard } from "@/components/bugs/crash-count-card"

export const BACK_TO_BUGS = "Back to Bugs"

/**
 * Yo-Yo's page: the Workplace tickets tagged `bug`, plus a crash count.
 * Must sit inside an `IssuesProvider` — it reads the same store and the
 * same saved copy as Agent Workplace, so there is nothing of its own to
 * save, reset or get out of sync. An open ticket is the Workplace's own
 * `TicketView`, keyed by `?issue=` so it is linkable and the back button
 * returns to the list.
 */
export function BugsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { issues, actors, now } = useIssues()

  const issueKey = params.get("issue")
  const closeIssue = React.useCallback(() => router.push("/bugs", { scroll: false }), [router])

  if (issueKey) {
    return <TicketView issueKey={issueKey} onClose={closeIssue} backLabel={BACK_TO_BUGS} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <CrashCountCard now={now} />
      <BugsList issues={issues} actors={actors} now={now} />
    </div>
  )
}
