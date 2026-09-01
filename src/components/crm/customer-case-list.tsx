"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon, PaperclipIcon } from "lucide-react"

import { PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { CasePriority, CaseStatus } from "@/lib/crm/db/schema"
import { formatDateTime, relativeTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"

export type CustomerCase = {
  id: string
  caseNumber: number
  subject: string
  status: CaseStatus
  priority: CasePriority
  lastActivityAt: Date | null
  messages: {
    id: string
    direction: "inbound" | "outbound"
    fromName: string | null
    fromEmail: string
    snippet: string | null
    bodyText: string | null
    sentAt: Date
    attachmentCount: number
  }[]
}

/**
 * Cases as expandable rows, each holding that case's own email thread —
 * the related-list shape a support console uses, so the whole relationship
 * reads at a glance without leaving the customer.
 */
export function CustomerCaseList({
  cases,
  customerName,
}: {
  cases: CustomerCase[]
  customerName: string
}) {
  // The most recent case starts open; it is what you almost always want.
  const [openId, setOpenId] = React.useState<string | null>(
    cases[0]?.id ?? null
  )

  if (cases.length === 0) {
    return (
      <p className="text-muted-foreground text-body rounded-xl border px-4 py-10 text-center">
        No cases yet for {customerName}.
      </p>
    )
  }

  return (
    <div className="divide-y overflow-hidden rounded-xl border">
      {cases.map((caseRow) => {
        const isOpen = openId === caseRow.id
        return (
          <Collapsible
            key={caseRow.id}
            open={isOpen}
            onOpenChange={(open) => setOpenId(open ? caseRow.id : null)}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <CollapsibleTrigger
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label={`Emails for case ${caseRow.caseNumber}`}
              >
                <ChevronRightIcon
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform",
                    isOpen && "rotate-90"
                  )}
                  aria-hidden
                />
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  #{caseRow.caseNumber}
                </span>
                <span className="text-body min-w-0 flex-1 truncate font-medium">
                  {caseRow.subject}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {caseRow.messages.length}{" "}
                  {caseRow.messages.length === 1 ? "email" : "emails"}
                </span>
              </CollapsibleTrigger>
              <StatusBadge status={caseRow.status} />
              <PriorityBadge priority={caseRow.priority} />
              <span className="text-muted-foreground w-16 shrink-0 text-right text-xs">
                {relativeTime(caseRow.lastActivityAt)}
              </span>
            </div>

            <CollapsibleContent>
              <div className="bg-muted/30 flex flex-col gap-2 border-t px-3 py-3">
                {caseRow.messages.length === 0 ? (
                  <p className="text-muted-foreground text-caption">
                    No email on this case yet.
                  </p>
                ) : (
                  caseRow.messages.map((message) => {
                    const inbound = message.direction === "inbound"
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "bg-card rounded-lg border border-l-2 px-3 py-2",
                          inbound ? "border-l-info" : "border-l-success"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-caption font-medium">
                            {inbound
                              ? (message.fromName ?? message.fromEmail)
                              : "You"}
                            <span className="text-muted-foreground font-normal">
                              {inbound ? " wrote" : " replied"}
                            </span>
                          </span>
                          <span
                            className="text-muted-foreground text-xs"
                            title={formatDateTime(message.sentAt)}
                          >
                            {relativeTime(message.sentAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-caption mt-1 line-clamp-2">
                          {message.snippet ?? message.bodyText ?? ""}
                        </p>
                        {message.attachmentCount > 0 ? (
                          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                            <PaperclipIcon className="size-3" aria-hidden />
                            {message.attachmentCount} attachment
                            {message.attachmentCount === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                    )
                  })
                )}
                <Link
                  href={`/crm/cases/${caseRow.id}`}
                  className="text-caption text-muted-foreground hover:text-foreground self-start underline underline-offset-4"
                >
                  Open case #{caseRow.caseNumber}
                </Link>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
