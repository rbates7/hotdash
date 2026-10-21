"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ReplyIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"

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
} from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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
    <div className="flex flex-wrap items-center gap-2.5 max-md:flex-nowrap max-md:gap-2">
      {/* Desktop and tablet: the filters inline, as before. Phone: one Filters button and a sheet. */}
      <div className="flex flex-wrap items-center gap-2.5 max-md:hidden">
        <FilterControls filters={filters} set={set} />
      </div>
      <FiltersSheet filters={filters} set={set} />
      <div className="relative ml-auto max-md:ml-0 max-md:min-w-0 max-md:flex-1">
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

type Set = (changes: Partial<CaseFilters>) => void

/** Status, priority and "Needs my reply" set (search stays outside the sheet). */
export function activeFilterCount(f: CaseFilters) {
  return (f.status !== null ? 1 : 0) + (f.priority !== null ? 1 : 0) + (f.waitingOnUs ? 1 : 0)
}

function FilterControls({ filters, set, stacked = false }: { filters: CaseFilters; set: Set; stacked?: boolean }) {
  return (
    <>
      <div
        role="group"
        aria-label="Status filter"
        className={cn(
          "bg-muted flex max-w-full flex-wrap items-center gap-0.5 rounded-lg p-0.5",
          // Phone sheet: an even two-column grid, so no label ("Closed") is left on a ragged row.
          stacked && "grid w-full grid-cols-2"
        )}
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
                // Phone sheet: labels never break across lines. min-h-11 here is belt-and-braces:
                // max-xl:min-h-11 already covers 390, and the real fix for the 43.99px reads is
                // the e2e waiting for the sheet to settle before measuring.
                stacked && "min-h-11 whitespace-nowrap",
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
        className={cn(CRM_44, stacked && "justify-start")}
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
        <SelectTrigger size="sm" aria-label="Priority filter" className={cn(CRM_44, stacked && "w-full")}>
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
    </>
  )
}

/**
 * Phone (<768): the status, "Needs my reply" and priority filters wrap into
 * three rows inline, so they live in a bottom sheet behind one Filters
 * button that shows how many are on. Each change applies at once (the list
 * updates behind the sheet); Done closes it. Every control is 44px.
 */
function FiltersSheet({ filters, set }: { filters: CaseFilters; set: Set }) {
  const [open, setOpen] = React.useState(false)
  const count = activeFilterCount(filters)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant={count > 0 ? "secondary" : "outline"}
            className="h-11! shrink-0 gap-1.5 px-3 md:hidden"
            aria-label={count > 0 ? `Filters, ${count} on` : "Filters"}
            data-testid="crm-filters-trigger"
          />
        }
      >
        <SlidersHorizontalIcon aria-hidden />
        Filters
        {count > 0 ? (
          <span
            data-testid="crm-filters-count"
            className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.65rem] leading-4 font-semibold tabular-nums"
          >
            {count}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} data-testid="crm-filters-sheet">
        <SheetHeader className="gap-1 px-4 pt-4 pb-0">
          <SheetTitle className="text-body font-semibold tracking-tight">Filters</SheetTitle>
          <SheetDescription className="text-caption text-muted-foreground">
            Changes apply right away.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 py-3">
          <FilterControls filters={filters} set={set} stacked />
        </div>
        <SheetFooter className="flex-row gap-2 px-4 pb-4">
          <Button
            variant="outline"
            className="h-11! flex-1"
            disabled={count === 0}
            onClick={() => set({ status: null, priority: null, waitingOnUs: false })}
          >
            Clear
          </Button>
          <Button className="h-11! flex-1" onClick={() => setOpen(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
