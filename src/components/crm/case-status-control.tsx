"use client"

import * as React from "react"

import { CRM_CASE_STATUSES, CRM_STATUS_LABELS, type CrmCase, type CrmCaseStatus } from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"
import { saveCaseEdit } from "@/hooks/use-crm-edits"

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"])
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"])

/**
 * The case panel's status: Deke's 4-segment control (open / waiting on us /
 * waiting on them / closed) in place of Sept's chevron stepper. A
 * radiogroup: one tab stop on the current segment, arrows (and Home / End)
 * move and select, as native radios do. The current segment is `primary`,
 * the rest are plain on the muted track. 44 tall below 1280. The change is
 * kept in this browser (`@/lib/crm/local-edits`); Gmail is never written.
 */
export function CaseStatusControl({
  crmCase,
  live,
  className,
}: {
  /** The case as shown (edits applied). */
  crmCase: CrmCase
  /** The case as the server sent it: what the edit records it replaced. */
  live: CrmCase
  className?: string
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const current = CRM_CASE_STATUSES.indexOf(crmCase.status)

  const choose = (status: CrmCaseStatus) => {
    if (status !== crmCase.status) saveCaseEdit(live, { status })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = CRM_CASE_STATUSES.length - 1
    let next: number | null = null
    if (NEXT_KEYS.has(event.key)) next = index === last ? 0 : index + 1
    else if (PREV_KEYS.has(event.key)) next = index === 0 ? last : index - 1
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    refs.current[next]?.focus()
    choose(CRM_CASE_STATUSES[next]!)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Status"
      data-testid="case-status-control"
      className={cn("bg-muted grid w-full grid-cols-4 gap-0.5 rounded-lg p-[3px]", className)}
    >
      {CRM_CASE_STATUSES.map((status, i) => {
        const checked = i === current
        return (
          <button
            key={status}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            data-status={status}
            tabIndex={checked || (current === -1 && i === 0) ? 0 : -1}
            onClick={() => choose(status)}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={cn(
              "focus-visible:ring-ring/50 h-8 min-w-0 truncate rounded-md px-2 text-xs max-md:px-1 max-md:leading-tight max-md:whitespace-normal font-medium transition-colors outline-none focus-visible:ring-[3px] max-xl:h-11",
              checked
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            {CRM_STATUS_LABELS[status]}
          </button>
        )
      })}
    </div>
  )
}
