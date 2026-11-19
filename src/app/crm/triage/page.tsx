import type { Metadata } from "next"
import { CircleCheckIcon } from "lucide-react"

import { TriageList } from "@/components/crm/triage/triage-list"
import { getDb } from "@/lib/crm/db/client"
import { relativeTime } from "@/lib/crm/format"
import { listTriageThreads } from "@/lib/crm/triage/server"

export const metadata: Metadata = { title: "Triage" }
export const dynamic = "force-dynamic"

export default async function TriagePage() {
  const threads = await listTriageThreads(getDb())

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
            <CircleCheckIcon className="size-6 text-chart-2" />
            <p className="text-sm font-medium">Triage is clear</p>
            <p className="text-sm text-muted-foreground">
              New unknown senders will land here after the next Gmail sync.
            </p>
          </div>
        ) : (
          <TriageList
            threads={threads.map((thread) => ({
              gmailThreadId: thread.gmailThreadId,
              senderEmail: thread.senderEmail,
              senderName: thread.senderName,
              subject: thread.subject,
              snippet: thread.snippet,
              messageCount: thread.messageCount,
              latestLabel: relativeTime(thread.latestAt),
            }))}
          />
        )}
      </div>
    </div>
  )
}
