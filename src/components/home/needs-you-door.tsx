import Link from "next/link"
import { InboxIcon } from "lucide-react"

import type { NeedsYou } from "@/lib/home"
import { cn } from "@/lib/utils"
import { Door, DoorEmpty } from "@/components/home/door"

const INBOX_HREF = "/agent-workplace?tab=inbox"

/**
 * "Needs you" lives in the Inbox door: the few rows still waiting on the
 * founder, each opening its ticket in the Workplace Inbox.
 */
export function NeedsYouDoor({ needs }: { needs: NeedsYou }) {
  const { items, waiting, overflow } = needs

  return (
    <Door
      name="Inbox"
      href={INBOX_HREF}
      icon={InboxIcon}
      count={waiting > 0 ? `${waiting} waiting` : undefined}
      caption="Needs you lives here."
    >
      {items.length > 0 ? (
        <div className="flex flex-1 flex-col gap-2">
          <span className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            Needs you
          </span>
          <ul aria-label="Needs you" className="border-surface-border -mx-2 flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={
                    item.issueKey
                      ? `${INBOX_HREF}&issue=${item.issueKey}`
                      : INBOX_HREF
                  }
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
                    {item.when}
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
