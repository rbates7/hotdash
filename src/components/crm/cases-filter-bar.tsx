"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { CASE_PRIORITIES, CASE_STATUSES, isCasePriority, isCaseStatus } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CRM_44, CRM_ROW_44 } from "@/components/crm/crm-touch"

const STATUS_TABS = [
  { value: "", label: "All" },
  ...CASE_STATUSES.map((value) => ({
    value,
    label: value === "waiting" ? "Waiting" : value[0]!.toUpperCase() + value.slice(1),
  })),
] as const

export function CasesFilterBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get("status") ?? ""
  const priority = searchParams.get("priority") ?? "all"
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")

  const buildUrl = React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const qs = params.toString()
      return qs ? `/crm/cases?${qs}` : "/crm/cases"
    },
    [searchParams]
  )

  React.useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (q === current) return
    const timeout = setTimeout(() => {
      router.replace(buildUrl({ q }))
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, router, buildUrl, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Phone (Deke 8:2): the status filter and priority share one strip that
          scrolls sideways under a full-width search; the page never does. */}
      <div
        data-slot="cases-filter-strip"
        className="contents max-md:order-2 max-md:flex max-md:w-full max-md:items-center max-md:gap-2 max-md:overflow-x-auto max-md:overscroll-x-contain"
      >
      <nav
        aria-label="Case status filter"
        className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5 max-md:shrink-0"
      >
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value || "all"}
            href={buildUrl({ status: tab.value })}
            aria-current={status === tab.value ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              status === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              FILTER_PRESSED,
              FILTER_44
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Select
        value={priority}
        onValueChange={(value) => {
          const next = value === "all" || !value ? "" : String(value)
          router.replace(buildUrl({ priority: isCasePriority(next) ? next : "" }))
        }}
        items={[
          { value: "all", label: "Any priority" },
          ...CASE_PRIORITIES.map((item) => ({
            value: item,
            label: item[0]!.toUpperCase() + item.slice(1),
          })),
        ]}
      >
        <SelectTrigger size="sm" aria-label="Priority filter" className={cn(CRM_44, "max-md:shrink-0")}>
          <SelectValue>
            {isCasePriority(priority)
              ? priority[0]!.toUpperCase() + priority.slice(1)
              : "Any priority"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className={CRM_ROW_44}>
            Any priority
          </SelectItem>
          {CASE_PRIORITIES.map((item) => (
            <SelectItem key={item} value={item} className={CRM_ROW_44}>
              {item[0]!.toUpperCase() + item.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      </div>
      {/* Phone: full width, above the strip. Tablet (Deke 8:665): fills the rest of the toolbar. */}
      <div className="relative ml-auto max-md:order-1 max-md:ml-0 max-md:w-full md:max-xl:min-w-48 md:max-xl:flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search cases…"
          aria-label="Search cases"
          className={cn("h-8 w-56 pl-8! max-xl:w-full", CRM_44)}
        />
      </div>
    </div>
  )
}

/**
 * The picked status reads as pressed at every width (Mack's ruling): solid
 * primary, ≥3:1 against the unpressed segments in light and dark. It is a
 * link, so `aria-current`; `!` beats the develop active classes.
 */
export const FILTER_PRESSED = "aria-[current=page]:bg-primary! aria-[current=page]:text-primary-foreground!"

/** 44×44 segments below 1280. */
const FILTER_44 =
  "max-xl:inline-flex max-xl:min-h-11 max-xl:min-w-11 max-xl:items-center max-xl:justify-center max-xl:px-3"

export function caseFilterFromSearch(searchParams: { get: (key: string) => string | null }) {
  const statusRaw = searchParams.get("status")
  const priorityRaw = searchParams.get("priority")
  return {
    status: isCaseStatus(statusRaw) ? statusRaw : undefined,
    priority: isCasePriority(priorityRaw) ? priorityRaw : undefined,
    q: searchParams.get("q")?.trim() || undefined,
  }
}
