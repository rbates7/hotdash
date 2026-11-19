"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { runBulk, type TriageBulkAction } from "@/lib/crm/triage/bulk"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { Badge } from "@/components/ui/badge"
import {
  resolve,
  TriageActions,
  TriageResolveError,
} from "@/components/crm/triage/triage-actions"
import {
  TriageBulk,
  TriageSelectCheckbox,
  type TriageBulkRunner,
} from "@/components/crm/triage/triage-bulk"

export type TriageListThread = {
  gmailThreadId: string
  senderEmail: string
  senderName: string | null
  subject: string | null
  snippet: string | null
  messageCount: number
  /** "2h ago", worked out on the server so hydration matches. */
  latestLabel: string
}

function request(action: TriageBulkAction, gmailThreadId: string) {
  if (action === "promote") return resolve({ gmailThreadId, action: "promote" })
  return resolve({
    gmailThreadId,
    action: "ignore",
    ignoreSenderAlways: action === "ignore-sender" ? true : undefined,
  })
}

/**
 * One resolve per card, settled independently. Promote and Always ignore
 * act on every pending thread from the sender on the server, so those run
 * once per sender and the outcome covers that sender's selected cards. A
 * 404 means the thread already left Triage (another tab, a sibling): done.
 */
export const runServerTriageBulk: TriageBulkRunner = (action, threads) =>
  runBulk(
    threads,
    async (thread) => {
      try {
        await request(action, thread.id)
      } catch (error) {
        if (error instanceof TriageResolveError && error.status === 404) return
        throw error
      }
    },
    { group: action === "ignore" ? undefined : (t) => t.senderEmail.trim().toLowerCase() }
  )

export function TriageList({ threads }: { threads: TriageListThread[] }) {
  const router = useRouter()
  const bulkThreads = React.useMemo(
    () =>
      threads.map((t) => ({
        id: t.gmailThreadId,
        senderEmail: t.senderEmail,
        senderName: t.senderName,
        subject: t.subject,
      })),
    [threads]
  )

  return (
    <TriageBulk threads={bulkThreads} run={runServerTriageBulk} onComplete={() => router.refresh()}>
      {threads.map((thread, i) => (
        <div
          key={thread.gmailThreadId}
          data-slot="triage-card"
          className="rounded-xl border bg-card px-4 py-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2.5 max-md:min-w-0">
              <TriageSelectCheckbox thread={bulkThreads[i]!} />
              <CrmAvatar name={thread.senderName ?? thread.senderEmail} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-medium">
                  {thread.senderName ?? thread.senderEmail}
                </span>
                <span className="text-xs text-muted-foreground">
                  {thread.senderEmail}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {thread.messageCount > 1 ? (
                <Badge variant="secondary">
                  {thread.messageCount} messages
                </Badge>
              ) : null}
              {thread.latestLabel}
            </span>
          </div>
          <p className="mt-2.5 text-sm font-medium">{thread.subject}</p>
          {thread.snippet ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {thread.snippet}
            </p>
          ) : null}
          <div className="mt-3">
            <TriageActions
              gmailThreadId={thread.gmailThreadId}
              senderEmail={thread.senderEmail}
              senderName={thread.senderName}
            />
          </div>
        </div>
      ))}
    </TriageBulk>
  )
}
