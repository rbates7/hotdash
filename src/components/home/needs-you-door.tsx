import Link from "next/link"
import { formatRelative } from "@/lib/clock"
import { InboxIcon } from "lucide-react"

import type { NeedsYou } from "@/lib/home"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Door, DoorEmpty } from "@/components/home/door"

const INBOX_HREF = "/agent-workplace?tab=inbox"

/** Deep link to one ticket in the Workplace Inbox. */
export function inboxIssueHref(issueKey?: string) {
  return issueKey
    ? `${INBOX_HREF}&issue=${encodeURIComponent(issueKey)}`
    : INBOX_HREF
}

/**
 * "Needs you" lives in the Inbox door: the few rows still waiting on the
 * founder, each opening its ticket in the Workplace Inbox.
 */
export function NeedsYouDoor({
  needs,
  now,
  loading = false,
}: {
  needs: NeedsYou
  /** The page's instant; row ages are measured from it. */
  now: Date
  /** True until the browser's saved board has been read; shows placeholders. */
  loading?: boolean
}) {
  const { items, waiting, overflow } = needs

  return (
    <Door
      name="Inbox"
      href={INBOX_HREF}
      icon={InboxIcon}
      count={!loading && waiting > 0 ? `${waiting} waiting` : undefined}
      caption="Needs you lives here."
    >
      {loading ? (
        <div aria-busy="true" aria-label="Loading what needs you" className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex items-start gap-2.5 px-0 py-2">
              <Skeleton className="mt-[5px] size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="flex flex-1 flex-col gap-2">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            Needs you
          </span>
          <ul aria-label="Needs you" className="border-surface-border -mx-2 flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={inboxIssueHref(item.issueKey)}
                  className="hover:bg-surface-selected focus-visible:ring-ring/50 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[5px] size-2 shrink-0 rounded-full",
                      item.unread
                        ? "bg-success"
                        : "ring-surface-border bg-transparent ring-1 ring-inset"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-label block truncate leading-[1.35] font-semibold tracking-tight">
                      {item.title}
                    </span>
                    <span className="text-caption text-muted-foreground mt-px block truncate leading-[1.4]">
                      {item.snippet}
                      {item.issueKey && ` · ${item.issueKey}`}
                    </span>
                  </span>
                  <span className="text-micro text-muted-foreground shrink-0 pt-0.5 font-medium whitespace-nowrap">
                    {formatRelative(Date.parse(item.at), now.getTime(), { style: "compact" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <Link
              href={INBOX_HREF}
              className="text-caption text-muted-foreground hover:text-foreground w-fit tracking-tight underline-offset-4 hover:underline"
            >
              +{overflow} more in the Inbox
            </Link>
          )}
        </div>
      ) : (
        <DoorEmpty
          title="Nothing needs you"
          hint="The Inbox is clear. Enjoy it."
        />
      )}
    </Door>
  )
}
