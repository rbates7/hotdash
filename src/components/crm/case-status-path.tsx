"use client"

import { CheckIcon } from "lucide-react"

import { CASE_STATUSES, STATUS_LABELS, type CaseStatus } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { useCrm } from "@/components/crm/crm-store"

const SHORT: Record<CaseStatus, string> = {
  new: "New",
  open: "Open",
  waiting: "Waiting",
  closed: "Closed",
}

/**
 * Service Cloud-style path bar: chevron segments, click to move the case.
 * Solid theme tokens only so the e2e contrast probe can measure the labels.
 */
export function CaseStatusPath({ caseId, status }: { caseId: string; status: CaseStatus }) {
  const { setStatus } = useCrm()
  const currentIndex = CASE_STATUSES.indexOf(status)

  return (
    <div className="flex w-full items-stretch" role="group" aria-label="Case status">
      {CASE_STATUSES.map((step, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex
        const first = index === 0
        const last = index === CASE_STATUSES.length - 1
        return (
          <button
            key={step}
            type="button"
            aria-current={isCurrent ? "step" : undefined}
            aria-label={STATUS_LABELS[step]}
            onClick={() => setStatus(caseId, step)}
            style={{
              clipPath: `polygon(0 0, calc(100% - 12px) 0, ${
                last ? "100% 0, 100% 100%" : "100% 50%"
              }, calc(100% - 12px) 100%, 0 100%${first ? "" : ", 12px 50%"})`,
            }}
            className={cn(
              // 44 tall below 1280, where the path is tapped.
              "-ml-2 flex h-8 flex-1 items-center justify-center gap-1.5 px-4 text-xs font-semibold transition-colors outline-none select-none first:ml-0 max-xl:h-11",
              "focus-visible:ring-ring/50 focus-visible:z-10 focus-visible:ring-[3px]",
              first && "rounded-l-lg",
              last && "rounded-r-lg",
              isCurrent
                ? step === "closed"
                  ? "bg-emerald-700 text-white dark:bg-emerald-300 dark:text-emerald-950"
                  : "bg-foreground text-background"
                : isDone
                  ? "bg-secondary text-foreground hover:bg-secondary/80"
                  : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {isDone ? <CheckIcon className="size-3" aria-hidden /> : null}
            {SHORT[step]}
          </button>
        )
      })}
    </div>
  )
}
