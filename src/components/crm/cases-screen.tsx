"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  CASE_PARAM,
  accountNames,
  clearFilters,
  filterCases,
  hasFilters,
  parseCaseFilters,
  withOpenCase,
} from "@/lib/crm/selectors"
import { cn } from "@/lib/utils"
import { useIsDesktop } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { CasePanel, EditsNote } from "@/components/crm/case-panel"
import { CasesFilterBar, useFilterNavigation } from "@/components/crm/cases-filter-bar"
import { CasesTable, type CaseRow } from "@/components/crm/cases-table"
import {
  CrmConnecting,
  CrmLiveRegion,
  CrmPhasePanel,
  CrmStaleNote,
  crmAnnouncement,
  isWaiting,
  useCrmData,
} from "@/components/crm/crm-data"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"
import { CRM_44 } from "@/components/crm/crm-touch"
import { GMAIL_PANEL_TITLES } from "@/components/crm/gmail-not-connected"

export const NO_CASES = "No cases yet. Conversations from the support inbox show here."
export const NO_MATCH = "No cases match"

const CASES_PATH = "/crm/cases"

/** Focus the row (table or card, whichever is on screen) that opened the panel. */
function focusCaseLink(id: string) {
  const links = Array.from(document.querySelectorAll<HTMLElement>(`[data-case-link="${CSS.escape(id)}"]`))
  ;(links.find((el) => el.getClientRects().length > 0) ?? links[0])?.focus()
}

/**
 * Cases (`/crm/cases`): the Gmail cases with Sept's filters, inline status
 * and priority pickers, and the case panel on `?case=<id>` — beside the
 * list at ≥1280, a sheet below that.
 */
export function CasesScreen() {
  const data = useCrmData()
  const router = useRouter()
  const searchParams = useSearchParams()
  const go = useFilterNavigation()
  const docked = useIsDesktop()
  const params = searchParams.toString()
  const filters = parseCaseFilters(searchParams)
  const openId = searchParams.get(CASE_PARAM)

  const rows = React.useMemo<CaseRow[]>(() => {
    const names = accountNames(data.accounts)
    const live = new Map(data.liveCases.map((c) => [c.id, c]))
    return [...data.cases]
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
      .map((c) => ({ crmCase: c, live: live.get(c.id) ?? c, accountName: c.accountId ? (names.get(c.accountId) ?? null) : null }))
  }, [data.cases, data.liveCases, data.accounts])
  const shown = React.useMemo(() => {
    const f = parseCaseFilters(new URLSearchParams(params))
    const keep = new Set(filterCases(rows.map((r) => r.crmCase), f).map((c) => c.id))
    return rows.filter((r) => keep.has(r.crmCase.id))
  }, [rows, params])

  const hrefFor = React.useCallback((id: string) => `${CASES_PATH}?${withOpenCase(params, id)}`, [params])

  // Closing returns focus to the row that opened the panel.
  const lastOpen = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (openId) {
      lastOpen.current = openId
      return
    }
    const id = lastOpen.current
    lastOpen.current = null
    if (id) focusCaseLink(id)
  }, [openId])

  const close = React.useCallback(() => {
    const qs = withOpenCase(params, null)
    router.push(qs ? `${CASES_PATH}?${qs}` : CASES_PATH, { scroll: false })
  }, [params, router])

  const live = data.phase === "live"
  const filtered = hasFilters(filters)
  const panelRow = openId && live ? (rows.find((r) => r.crmCase.id === openId) ?? null) : undefined
  const showPanel = openId !== null && panelRow !== undefined
  const count = live ? `${shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`} ${rows.length === 1 ? "case" : "cases"}` : ""

  return (
    <section aria-labelledby="crm-cases-heading" className="flex min-w-0 flex-col gap-3.5">
      <CrmLiveRegion
        message={crmAnnouncement(data, rows.length === 0 ? "No cases yet" : shown.length === 0 ? NO_MATCH : `Showing ${count}`)}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="crm-cases-heading" className="text-label font-semibold tracking-tight">
          Cases
          {live ? <span className="text-muted-foreground ml-2 text-xs font-normal tabular-nums">{count}</span> : null}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <CrmStaleNote data={data} />
          <EditsNote />
        </div>
      </div>

      {data.phase === "not_connected" || data.phase === "unauthorized" ? (
        <CrmPhasePanel data={data} title={GMAIL_PANEL_TITLES.cases} />
      ) : (
        <>
          <CasesFilterBar />
          {isWaiting(data) ? (
            <div aria-busy="true" className="flex flex-col gap-2">
              <CrmConnecting className="self-start" />
              <CrmTableSkeleton label="Loading cases" />
            </div>
          ) : rows.length === 0 ? (
            <p className="bg-surface border-surface-border text-muted-foreground text-caption rounded-xl border px-4 py-10 text-center">
              {NO_CASES}
            </p>
          ) : (
            <div
              className={cn(
                "grid min-w-0 items-start gap-4",
                showPanel && docked && "xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]"
              )}
            >
              <div className="min-w-0">
                {shown.length === 0 && filtered ? (
                  <div className="bg-surface border-surface-border flex flex-col items-center gap-3 rounded-xl border px-4 py-10 text-center">
                    <p className="text-label font-semibold tracking-tight">{NO_MATCH}</p>
                    <Button variant="outline" size="sm" className={CRM_44} onClick={() => go(clearFilters(params))}>
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <CasesTable
                    rows={shown}
                    hrefFor={hrefFor}
                    openId={openId}
                    compact={showPanel && docked}
                    nowMs={data.nowMs}
                  />
                )}
              </div>
              {showPanel ? <CasePanel row={panelRow} docked={docked} nowMs={data.nowMs} onClose={close} /> : null}
            </div>
          )}
        </>
      )}
    </section>
  )
}
