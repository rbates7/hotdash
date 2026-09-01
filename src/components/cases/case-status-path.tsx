"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import type { CaseStatus } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

const STATUS_ORDER: { value: CaseStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "closed", label: "Closed" },
]

// Service Cloud-style Path bar: chevron segments, click to move the case.
export function CaseStatusPath({
  caseId,
  status,
}: {
  caseId: string
  status: CaseStatus
}) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)
  const currentIndex = STATUS_ORDER.findIndex((s) => s.value === status)

  async function setStatus(next: CaseStatus) {
    if (next === status || isBusy) return
    setIsBusy(true)
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed.")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update status."
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div
      className="flex w-full items-stretch"
      role="group"
      aria-label="Case status"
    >
      {STATUS_ORDER.map((step, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex
        const first = index === 0
        const last = index === STATUS_ORDER.length - 1
        return (
          <button
            key={step.value}
            type="button"
            disabled={isBusy}
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => setStatus(step.value)}
            style={{
              clipPath: `polygon(0 0, calc(100% - 12px) 0, ${
                last ? "100% 0, 100% 100%" : "100% 50%"
              }, calc(100% - 12px) 100%, 0 100%${
                first ? "" : ", 12px 50%"
              })`,
            }}
            className={cn(
              "-ml-2 flex h-8 flex-1 items-center justify-center gap-1.5 px-4 text-xs font-medium transition-colors outline-none select-none first:ml-0 disabled:cursor-wait",
              first ? "rounded-l-lg" : "",
              last ? "rounded-r-lg" : "",
              isCurrent
                ? step.value === "closed"
                  ? "bg-chart-2 text-background"
                  : "bg-primary text-primary-foreground"
                : isDone
                  ? "bg-primary/20 text-foreground hover:bg-primary/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            {isDone ? <CheckIcon className="size-3" /> : null}
            {step.label}
          </button>
        )
      })}
    </div>
  )
}
