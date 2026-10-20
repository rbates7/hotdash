"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { agoLabel, filterAccounts } from "@/lib/crm/selectors"
import type { CrmAccount } from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useFilterNavigation } from "@/components/crm/cases-filter-bar"
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

export const NO_ACCOUNTS = "No accounts yet. Schools and companies show here once their people email the support inbox."
export const NO_ACCOUNT_MATCH = "No accounts match"
export const ACCOUNTS_PANEL_TITLE = "Accounts from the support inbox"

function people(a: CrmAccount) {
  return a.contacts.map((p) => p.name ?? p.email).join(", ")
}

/** Gmail knows only the domain, so the name usually is the domain: then it is not repeated. */
function AccountName({ a }: { a: CrmAccount }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{a.name}</span>
      {a.domain && a.domain !== a.name ? (
        <span className="text-muted-foreground block truncate text-xs">{a.domain}</span>
      ) : null}
    </span>
  )
}

/**
 * Accounts (`/crm/accounts`): one row per email domain in the support
 * inbox, with Deke's columns (spec §2) where Gmail can fill them: Account
 * (+ domain), Contacts (the spec's Coaches), Last activity from 1180, Open
 * cases. No plan or school type (no source), and no account page (cut), so
 * the rows are not links. Personal-domain senders have no account and are
 * not grouped here. Search lives in `?q=`. Below 820 the table collapses to
 * a list: the name with its domain, and the open count on the right.
 */
export function AccountsScreen() {
  const data = useCrmData()
  const searchParams = useSearchParams()
  const go = useFilterNavigation()
  const urlQ = searchParams.get("q") ?? ""
  const [q, setQ] = React.useState(urlQ)
  const [lastUrlQ, setLastUrlQ] = React.useState(urlQ)
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ)
    setQ(urlQ)
  }
  const params = searchParams.toString()
  React.useEffect(() => {
    if (q === urlQ) return
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q) next.set("q", q)
      else next.delete("q")
      go(next.toString())
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, urlQ, params, go])

  const all = data.accounts
  const shown = React.useMemo(() => filterAccounts(all, urlQ), [all, urlQ])
  const live = data.phase === "live"
  const count = `${shown.length === all.length ? all.length : `${shown.length} of ${all.length}`} ${all.length === 1 ? "account" : "accounts"}`

  return (
    <section aria-labelledby="crm-accounts-heading" className="flex min-w-0 flex-col gap-3.5">
      <CrmLiveRegion
        message={crmAnnouncement(data, all.length === 0 ? "No accounts yet" : shown.length === 0 ? NO_ACCOUNT_MATCH : `Showing ${count}`)}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="crm-accounts-heading" className="text-label font-semibold tracking-tight">
          Accounts
          {live ? <span className="text-muted-foreground ml-2 text-xs font-normal tabular-nums">{count}</span> : null}
        </h2>
        <CrmStaleNote data={data} />
        {data.phase === "not_connected" || data.phase === "unauthorized" ? null : (
          <div className="relative max-md:w-full">
            <SearchIcon
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search accounts…"
              aria-label="Search accounts"
              className={cn("h-8 w-56 pl-9! max-md:w-full", CRM_44)}
            />
          </div>
        )}
      </div>

      {data.phase === "not_connected" || data.phase === "unauthorized" ? (
        <CrmPhasePanel data={data} title={ACCOUNTS_PANEL_TITLE} />
      ) : isWaiting(data) ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <CrmConnecting className="self-start" />
          <CrmTableSkeleton label="Loading accounts" />
        </div>
      ) : all.length === 0 ? (
        <p className="bg-surface border-surface-border text-muted-foreground text-caption rounded-xl border px-4 py-10 text-center">
          {NO_ACCOUNTS}
        </p>
      ) : shown.length === 0 ? (
        <div className="bg-surface border-surface-border flex flex-col items-center gap-3 rounded-xl border px-4 py-10 text-center">
          <p className="text-label font-semibold tracking-tight">{NO_ACCOUNT_MATCH}</p>
          <Button variant="outline" size="sm" className={CRM_44} onClick={() => setQ("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-surface border-surface-border overflow-hidden rounded-xl border max-[819px]:hidden">
            <Table aria-label="Accounts">
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead className="hidden min-[1180px]:table-cell">Last activity</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((a) => (
                  <TableRow key={a.id} data-account-id={a.id}>
                    <TableCell className="max-w-72">
                      <AccountName a={a} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="tabular-nums">{a.contacts.length}</span>
                      {a.contacts.length > 0 ? (
                        <span className="text-muted-foreground block truncate text-xs" title={people(a)}>
                          {people(a)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden min-[1180px]:table-cell">
                      {agoLabel(a.lastActivityAt, data.nowMs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.openCases}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul
            aria-label="Accounts"
            data-testid="account-list"
            className="bg-surface border-surface-border divide-surface-border flex flex-col divide-y overflow-hidden rounded-xl border min-[820px]:hidden"
          >
            {shown.map((a) => (
              <li key={a.id} data-account-id={a.id} className="flex min-h-11 min-w-0 items-center gap-3 px-3.5 py-2.5">
                <AccountName a={a} />
                <span className="ml-auto shrink-0 text-sm tabular-nums" aria-label={`${a.openCases} open`}>
                  {a.openCases}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
