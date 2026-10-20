"use client"

import { PaperclipIcon } from "lucide-react"

import { initials, personLabel, type CrmMessage } from "@/lib/crm/case-view"
import { agoLabel } from "@/lib/crm/selectors"
import { cn } from "@/lib/utils"
import { useCrmThread } from "@/hooks/use-crm-summary"
import { Skeleton } from "@/components/ui/skeleton"
import { CrmConnecting, CrmSessionExpired } from "@/components/crm/crm-data"

export const THREAD_NOT_FOUND = "Thread not found"

/**
 * One message's body. The route sends plain text only (no HTML field at
 * all), and it is rendered as a React text child: any markup in it shows
 * as literal characters and never becomes an element. Line breaks are kept.
 */
export function MessageBody({ message }: { message: Pick<CrmMessage, "bodyText"> }) {
  return (
    <p data-testid="message-text" className="text-body min-w-0 whitespace-pre-wrap break-words">
      {message.bodyText || "(empty message)"}
    </p>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A thread message as Deke's card: 2px left rule, customer `info`, you `success`. */
export function MessageCard({ message: m, nowMs }: { message: CrmMessage; nowMs: number }) {
  const outbound = m.direction === "outbound"
  return (
    <article
      data-direction={m.direction}
      className={cn(
        "bg-surface border-surface-border min-w-0 rounded-lg border border-l-2 p-3",
        outbound ? "border-l-success" : "border-l-info"
      )}
    >
      <header className="mb-1.5 flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="border-surface-border text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.55rem] font-medium"
        >
          {initials(m.from)}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{outbound ? "You replied" : personLabel(m.from)}</p>
        <time dateTime={m.sentAt} className="text-muted-foreground shrink-0 text-xs">
          {agoLabel(m.sentAt, nowMs)}
        </time>
      </header>
      <MessageBody message={m} />
      {m.attachments.length > 0 ? (
        <ul aria-label="Attachments" className="mt-2 flex flex-wrap gap-1.5">
          {m.attachments.map((a, i) => (
            <li key={`${a.name}-${i}`} className="bg-muted flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              <PaperclipIcon aria-hidden className="size-3" />
              <span className="max-w-48 truncate">{a.name}</span>
              <span className="text-muted-foreground">{formatSize(a.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function CaseThread({ caseId, nowMs }: { caseId: string; nowMs: number }) {
  const thread = useCrmThread(caseId)
  if (thread.phase === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-3" data-testid="thread-loading">
        <CrmConnecting />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }
  if (thread.phase === "unauthorized") return <CrmSessionExpired />
  if (thread.phase === "not_found") {
    return (
      <p data-testid="thread-not-found" className="text-muted-foreground text-caption">
        {THREAD_NOT_FOUND}
      </p>
    )
  }
  if (thread.phase === "error") {
    return <p className="text-muted-foreground text-caption">The thread could not be read just now. It will load when the inbox answers.</p>
  }
  if (thread.messages.length === 0) {
    return <p className="text-muted-foreground text-caption">No messages in this thread yet.</p>
  }
  return (
    <ol aria-label="Thread" className="flex flex-col gap-3">
      {thread.messages.map((m) => (
        <li key={m.id}>
          <MessageCard message={m} nowMs={nowMs} />
        </li>
      ))}
    </ol>
  )
}
