import { CircleCheckIcon } from "lucide-react"

import { ContactAvatar } from "@/components/crm/contact-avatar"
import { TriageActions } from "@/components/crm/triage-actions"
import { Badge } from "@/components/ui/badge"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"
import { listTriageThreads } from "@/lib/crm/triage/server"

export const metadata = { title: "Triage · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function TriagePage() {
  const threads = listTriageThreads(getDb())

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground text-body">
        Email from senders the CRM doesn&apos;t know yet. Promote a thread to
        make the sender a contact and open a case; ignore what doesn&apos;t
        belong. Newsletters and no-reply senders are filtered out before they
        reach here.
      </p>

      <div className="flex flex-col gap-3">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border px-4 py-14 text-center">
            <CircleCheckIcon className="text-success size-6" aria-hidden />
            <p className="text-body font-medium">Triage is clear</p>
            <p className="text-caption text-muted-foreground">
              New unknown senders will land here after the next Gmail sync.
            </p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.gmailThreadId}
              data-slot="triage-card"
              className="bg-card rounded-xl border px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <ContactAvatar
                    name={thread.senderName ?? thread.senderEmail}
                  />
                  <span className="flex flex-col leading-tight">
                    <span className="text-body font-medium">
                      {thread.senderName ?? thread.senderEmail}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {thread.senderEmail}
                    </span>
                  </span>
                </span>
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  {thread.messageCount > 1 ? (
                    <Badge variant="secondary">
                      {thread.messageCount} messages
                    </Badge>
                  ) : null}
                  {relativeTime(thread.latestAt)}
                </span>
              </div>
              <p className="text-body mt-2.5 font-medium">{thread.subject}</p>
              {thread.snippet ? (
                <p className="text-muted-foreground text-body mt-0.5 line-clamp-2">
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
