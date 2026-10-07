"use client"

import { openInboxItems } from "@/lib/inbox"
import { inbox } from "@/lib/workplace-fixture"
import { cn } from "@/lib/utils"
import { useIssues } from "@/components/agent-workplace/issues-store"

export function InboxPanel({
  onOpenIssue,
}: {
  onOpenIssue: (key: string) => void
}) {
  const { issues } = useIssues()
  // Same selector Home's "Needs you" uses, so a ticket closed on the board
  // leaves both at once.
  const rows = openInboxItems(inbox, issues)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground -mt-1 tracking-tight">
        Absorbs Home &ldquo;Needs you.&rdquo; Founder-only.
      </p>
      {rows.length === 0 ? (
        <p className="bg-surface border-surface-border text-label text-muted-foreground max-w-[1100px] rounded-xl border px-[18px] py-6 text-center">
          Nothing in the Inbox.
        </p>
      ) : (
      <ul className="bg-surface border-surface-border max-w-[1100px] overflow-hidden rounded-xl border">
        {rows.map((item) => {
          const Row = item.issueKey ? "button" : "div"
          return (
            <li
              key={item.id}
              className={cn(
                "border-border border-b last:border-b-0",
                item.dismissed && "opacity-[0.42]"
              )}
            >
              <Row
                {...(item.issueKey
                  ? {
                      type: "button" as const,
                      onClick: () => onOpenIssue(item.issueKey!),
                    }
                  : {})}
                className={cn(
                  "flex w-full items-start gap-3 px-[18px] py-4 text-left",
                  item.issueKey &&
                    "hover:bg-surface-hover focus-visible:ring-ring/50 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    item.unread
                      ? "bg-success"
                      : "ring-surface-border bg-transparent ring-1 ring-inset"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-label block leading-[1.35] font-semibold tracking-tight">
                    {item.title}
                  </span>
                  <span className="text-caption text-muted-foreground mt-[3px] block leading-[1.4]">
                    {item.snippet}
                    {item.issueKey && ` · ${item.issueKey}`}
                  </span>
                </span>
                <span className="text-micro text-muted-foreground shrink-0 pt-0.5 font-medium whitespace-nowrap">
                  {item.when}
                </span>
              </Row>
            </li>
          )
        })}
      </ul>
      )}
    </div>
  )
}
