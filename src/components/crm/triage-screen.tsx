"use client"

import { CheckCircleIcon, FlameIcon } from "lucide-react"

import { formatCrmRelative, listTriageThreads } from "@/lib/crm/crm"
import { isSeedThread } from "@/lib/crm/fixture"
import { SampleDataTag } from "@/components/sample-data"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { useCrm } from "@/components/crm/crm-store"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"
import { TriageActions } from "@/components/crm/triage-actions"

export function TriageScreen() {
  const store = useCrm()
  const threads = listTriageThreads(store.messages)

  if (!store.persisted) return <CrmTableSkeleton label="Loading saved triage" />

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-title-sm font-semibold tracking-tight">Triage</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Email from senders the CRM doesn&apos;t know yet. Promote a thread to make the sender a
          contact and open a case; ignore what doesn&apos;t belong.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {threads.length === 0 ? (
          <div
            role="status"
            aria-label="Triage is clear"
            className="flex flex-col items-center gap-2 rounded-xl border px-4 py-14 text-center"
          >
            <CheckCircleIcon className="size-6 text-emerald-700 dark:text-emerald-300" aria-hidden />
            <p className="text-sm font-medium">Triage is clear</p>
            <p className="text-muted-foreground text-sm">
              New unknown senders will land here after the next Gmail sync.
            </p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.threadId}
              data-slot="triage-card"
              className="bg-card rounded-xl border px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <CrmAvatar name={thread.senderName ?? thread.senderEmail} />
                    <span className="flex flex-col leading-tight">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {thread.senderName ?? thread.senderEmail}
                        {isSeedThread(thread.threadId) ? <SampleDataTag /> : null}
                      </span>
                      <span className="text-muted-foreground text-xs">{thread.senderEmail}</span>
                    </span>
                </span>
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  {thread.messageCount > 1 ? (
                    <span className="bg-muted text-foreground rounded-full px-2 py-0.5 font-semibold">
                      {thread.messageCount} messages
                    </span>
                  ) : (
                    <FlameIcon className="size-3.5" aria-hidden />
                  )}
                  {formatCrmRelative(thread.latestAt, store.nowMs)}
                </span>
              </div>
              <p className="mt-2.5 text-sm font-medium">{thread.subject}</p>
              {thread.snippet ? (
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{thread.snippet}</p>
              ) : null}
              <div className="mt-3">
                <TriageActions
                  threadId={thread.threadId}
                  senderEmail={thread.senderEmail}
                  senderName={thread.senderName}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
