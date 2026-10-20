"use client"

import * as React from "react"
import { PaperclipIcon } from "lucide-react"

import { sanitizeHtml } from "@/lib/crm/sanitize-html"
import { agoLabel } from "@/lib/crm/selectors"
import type { CrmMessage } from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import { useCrmThread } from "@/hooks/use-crm-summary"
import { useMounted } from "@/hooks/use-mounted"
import { Skeleton } from "@/components/ui/skeleton"
import { CrmConnecting, CrmSessionExpired } from "@/components/crm/crm-data"

/**
 * One message's body. HTML goes through the allow-list sanitizer and only
 * its output reaches the DOM; with no HTML, or before the browser can
 * sanitize (the server has no DOMParser), the plain text is shown as text.
 */
export function MessageBody({ message }: { message: Pick<CrmMessage, "bodyHtml" | "bodyText"> }) {
  const mounted = useMounted()
  const safe = React.useMemo(
    () => (mounted && message.bodyHtml ? sanitizeHtml(message.bodyHtml) : null),
    [mounted, message.bodyHtml]
  )
  if (safe) {
    return (
      <div
        data-testid="message-html"
        className="text-body min-w-0 break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:whitespace-pre-wrap [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5"
        // Sanitized by `sanitizeHtml` (allow-list, no scripts, handlers, styles or unsafe URLs).
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    )
  }
  return (
    <pre data-testid="message-text" className="text-body font-sans whitespace-pre-wrap break-words">
      {message.bodyText || "(empty message)"}
    </pre>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  if (thread.phase === "error") {
    return <p className="text-muted-foreground text-caption">The thread could not be read just now. It will load when the inbox answers.</p>
  }
  if (thread.messages.length === 0) {
    return <p className="text-muted-foreground text-caption">No messages in this thread yet.</p>
  }
  return (
    <ol aria-label="Thread" className="flex flex-col gap-3">
      {thread.messages.map((m) => (
        <li
          key={m.id}
          data-direction={m.direction}
          className={cn(
            "bg-card min-w-0 rounded-lg border p-3",
            m.direction === "outbound" && "border-l-success border-l-4"
          )}
        >
          <div className="mb-2 flex min-w-0 items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-sm">
              <span className="font-medium">{m.direction === "outbound" ? "You" : (m.from.name ?? m.from.email)}</span>
              {m.direction === "outbound" ? <span className="text-muted-foreground"> replied</span> : null}
            </p>
            <time dateTime={m.sentAt} className="text-muted-foreground shrink-0 text-xs">
              {agoLabel(m.sentAt, nowMs)}
            </time>
          </div>
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
        </li>
      ))}
    </ol>
  )
}
