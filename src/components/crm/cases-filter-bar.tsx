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
      <nav aria-label="Case status filter" className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value || "all"}
            href={buildUrl({ status: tab.value })}
            aria-current={status === tab.value ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              status === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
        <SelectTrigger size="sm" aria-label="Priority filter">
          <SelectValue>
            {isCasePriority(priority)
              ? priority[0]!.toUpperCase() + priority.slice(1)
              : "Any priority"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any priority</SelectItem>
          {CASE_PRIORITIES.map((item) => (
            <SelectItem key={item} value={item}>
              {item[0]!.toUpperCase() + item.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative ml-auto">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search cases…"
          aria-label="Search cases"
          className="h-8 w-56 pl-8"
        />
      </div>
    </div>
  )
}

export function caseFilterFromSearch(searchParams: { get: (key: string) => string | null }) {
  const statusRaw = searchParams.get("status")
  const priorityRaw = searchParams.get("priority")
  return {
    status: isCaseStatus(statusRaw) ? statusRaw : undefined,
    priority: isCasePriority(priorityRaw) ? priorityRaw : undefined,
    q: searchParams.get("q")?.trim() || undefined,
  }
}
