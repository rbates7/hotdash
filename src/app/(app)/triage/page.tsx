import type { Metadata } from "next"
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"

import { TriageActions } from "@/components/triage/triage-actions"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getDb } from "@/lib/db/client"
import { relativeTime } from "@/lib/format"
import { listTriageThreads } from "@/lib/triage/server"

export const metadata: Metadata = { title: "Triage" }
export const dynamic = "force-dynamic"

export default async function TriagePage() {
  const threads = listTriageThreads(getDb())

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Triage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Email from senders the CRM doesn&apos;t know yet. Promote a thread to
        make the sender a contact and open a case; ignore what doesn&apos;t
        belong.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border px-4 py-14 text-center">
            <CheckCircleIcon className="size-6 text-chart-2" />
            <p className="text-sm font-medium">Triage is clear</p>
            <p className="text-sm text-muted-foreground">
              New unknown senders will land here after the next Gmail sync.
            </p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.gmailThreadId}
              className="rounded-xl border bg-card px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <Avatar name={thread.senderName ?? thread.senderEmail} />
                  <span className="flex flex-col leading-tight">
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
                  {relativeTime(thread.latestAt)}
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
          ))
        )}
      </div>
    </div>
  )
}
