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
import { useCasePanelMode } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { CasePanel, EditsNote, type CasePanelNav } from "@/components/crm/case-panel"
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

/** ↑ / ↓ move between cases beside the list, unless a control wants the arrows. */
function wantsArrows(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable=true], [role=radiogroup], [role=listbox], [role=menu]"))
}

/**
 * Cases (`/crm/cases`): the Gmail cases with Sept's filters, inline status
 * and priority pickers, and the case panel on `?case=<id>` (Deke's spec §3:
 * beside the list at ≥1440, a sheet below that).
 */
export function CasesScreen() {
  const data = useCrmData()
  const router = useRouter()
  const searchParams = useSearchParams()
  const go = useFilterNavigation()
  const mode = useCasePanelMode()
  const docked = mode === "split"
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

  const nav = React.useMemo<CasePanelNav | null>(() => {
    const index = openId ? shown.findIndex((r) => r.crmCase.id === openId) : -1
    if (index < 0) return null
    const at = (i: number) => (i >= 0 && i < shown.length ? hrefFor(shown[i]!.crmCase.id) : null)
    return { index, total: shown.length, prevHref: at(index - 1), nextHref: at(index + 1) }
  }, [openId, shown, hrefFor])

  // Beside the list, ↑ / ↓ move between cases (spec §3).
  React.useEffect(() => {
    if (!docked || !showPanel || !nav) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || wantsArrows(event.target)) return
      const href = event.key === "ArrowUp" ? nav.prevHref : event.key === "ArrowDown" ? nav.nextHref : null
      if (!href) return
      event.preventDefault()
      router.push(href, { scroll: false })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [docked, showPanel, nav, router])

  return (
    <section aria-labelledby="crm-cases-heading" className="flex min-w-0 flex-col gap-3">
      <CrmLiveRegion
        message={crmAnnouncement(data, rows.length === 0 ? "No cases yet" : shown.length === 0 ? NO_MATCH : `Showing ${count}`)}
      />
      <h2 id="crm-cases-heading" className="sr-only">
        Cases
      </h2>

      {data.phase === "not_connected" || data.phase === "unauthorized" ? (
        <>
          <EditsNote />
          <CrmPhasePanel data={data} title={GMAIL_PANEL_TITLES.cases} />
        </>
      ) : (
        <>
          <CasesFilterBar />
          {/* Sept's "12 cases · …" line; the edits note stays visible here (Simmons). */}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {live ? (
              <span className="tabular-nums" data-testid="crm-cases-count">
                {count}
              </span>
            ) : null}
            <CrmStaleNote data={data} />
            <EditsNote />
          </div>
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
                showPanel && docked && "grid-cols-[minmax(0,1fr)_480px]"
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
              {showPanel ? <CasePanel row={panelRow} mode={mode} nav={nav} nowMs={data.nowMs} onClose={close} /> : null}
            </div>
          )}
        </>
      )}
    </section>
  )
}
