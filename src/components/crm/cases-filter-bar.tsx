"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ReplyIcon, SearchIcon } from "lucide-react"

import {
  parseCaseFilters,
  withFilters,
  type CaseFilters,
} from "@/lib/crm/selectors"
import {
  CRM_CASE_STATUSES,
  CRM_PRIORITIES,
  CRM_PRIORITY_LABELS,
  CRM_STATUS_LABELS,
  type CrmPriority,
} from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  { value: null, label: "All" },
  ...CRM_CASE_STATUSES.map((value) => ({ value, label: CRM_STATUS_LABELS[value] })),
]

const ANY = "any"
const PRIORITY_ITEMS = [
  { value: ANY, label: "Any priority" },
  ...CRM_PRIORITIES.map((value) => ({ value, label: CRM_PRIORITY_LABELS[value] })),
]

/** Push a filter change into the URL, keeping the open case and every other key. */
export function useFilterNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  return React.useCallback(
    (qs: string) => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }),
    [router, pathname]
  )
}

/**
 * The Cases filters, ported from crm-port's filter bar with only what Gmail
 * can answer: status, priority, "Waiting on you" and search. Everything
 * lives in the query string, so a filtered list is a link that survives a
 * reload. No owner, date window or audience: Gmail has no source for them.
 */
export function CasesFilterBar() {
  const searchParams = useSearchParams()
  const go = useFilterNavigation()
  const filters = parseCaseFilters(searchParams)
  const [q, setQ] = React.useState(filters.q)
  const params = searchParams.toString()

  // The URL is the truth: Clear filters (or back/forward) resets the box.
  const [lastUrlQ, setLastUrlQ] = React.useState(filters.q)
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q)
    setQ(filters.q)
  }

  React.useEffect(() => {
    if (q === filters.q) return
    const timeout = setTimeout(() => go(withFilters(params, { q })), 300)
    return () => clearTimeout(timeout)
  }, [q, filters.q, params, go])

  const set = (changes: Partial<CaseFilters>) => go(withFilters(params, changes))

  return (
    <div className="flex flex-wrap items-center gap-2.5 max-md:gap-2">
      <div
        role="group"
        aria-label="Status filter"
        className="bg-muted flex max-w-full flex-wrap items-center gap-0.5 rounded-lg p-0.5"
      >
        {STATUS_TABS.map((tab) => {
          const active = filters.status === tab.value
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={active}
              onClick={() => set({ status: tab.value })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-xl:min-h-11 max-xl:min-w-11 max-xl:px-3",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <Button
        variant={filters.waitingOnUs ? "default" : "outline"}
        size="sm"
        aria-pressed={filters.waitingOnUs}
        title="Waiting on you: their message is the newest, so the reply is yours"
        className={CRM_44}
        onClick={() => set({ waitingOnUs: !filters.waitingOnUs })}
      >
        <ReplyIcon aria-hidden />
        Needs my reply
      </Button>
      <Select
        items={PRIORITY_ITEMS}
        value={filters.priority ?? ANY}
        onValueChange={(value) => set({ priority: value === ANY ? null : (value as CrmPriority) })}
      >
        <SelectTrigger size="sm" aria-label="Priority filter" className={CRM_44}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} className={CRM_ROW_44}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative ml-auto max-md:ml-0 max-md:w-full">
        <SearchIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search cases…"
          aria-label="Search cases"
          className={cn("h-8 w-56 pl-9! max-md:w-full", CRM_44)}
        />
      </div>
    </div>
  )
}
