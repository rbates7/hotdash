import type { Metadata } from "next"

import { AccountViewFilter } from "@/components/crm/account-view-filter"
import { AccountsFilterBar } from "@/components/crm/accounts-filter-bar"
import { AccountsTable } from "@/components/crm/accounts-table"
import { Pager } from "@/components/crm/pager"
import { SearchInput } from "@/components/crm/search-input"
import {
  ACCOUNTS_PER_PAGE,
  ACCOUNT_SORTS,
  ACCOUNT_VIEWS,
  PROSPECT_MIN_COACHES,
  listAccounts,
  listAllAccounts,
} from "@/lib/crm/contacts/accounts"
import { listPlanLabels } from "@/lib/crm/contacts/server"
import { getDb } from "@/lib/crm/db/client"
import { parseDirection, parseOffset, parseOneOf } from "@/lib/crm/list"

export const metadata: Metadata = { title: "Accounts · CRM · Chlk" }
export const dynamic = "force-dynamic"

const SUBTITLES = {
  staff: "Programs and schools with a Chlk staff account.",
  prospective: `Schools where ${PROSPECT_MIN_COACHES} or more coaches without a staff account typed the same name into their profile. Click one to see who.`,
}

const EMPTY = {
  staff:
    "No staff accounts yet. They appear here once the Supabase sync links coaches to one, or when you link someone by hand.",
  prospective:
    "No prospects yet: nowhere have two coaches without a staff account typed the same school.",
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    view?: string
    plan?: string
    coaches?: string
    open?: string
    sort?: string
    dir?: string
    offset?: string
    allsort?: string
    alldir?: string
  }>
}) {
  const params = await searchParams
  const db = getDb()
  const q = params.q?.trim() || undefined
  const view = parseOneOf(ACCOUNT_VIEWS, params.view)
  const plan = params.plan?.trim() || undefined
  const parsedCoaches = Number(params.coaches)
  const minCoaches =
    Number.isFinite(parsedCoaches) && parsedCoaches > 1
      ? Math.floor(parsedCoaches)
      : undefined
  const hasOpenCase = params.open === "1"
  const sort = parseOneOf(ACCOUNT_SORTS, params.sort)
  const direction = parseDirection(params.dir)
  const offset = parseOffset(params.offset)
  const filtered = Boolean(q || plan || minCoaches || hasOpenCase)
  // The complete list below carries its own ordering: it has no pager, so
  // sorting it must not move the paged table above off page one.
  const allSort = parseOneOf(ACCOUNT_SORTS, params.allsort) ?? "coaches"
  const allDirection = parseDirection(params.alldir)

  const { rows, total, limit, viewCounts, view: shown } = await listAccounts(db, {
    q,
    view,
    plan,
    minCoaches,
    hasOpenCase,
    sort,
    direction,
    limit: ACCOUNTS_PER_PAGE,
    offset,
  })
  // Every school, under the same search and filters, but never the view or
  // the page: this list is the whole picture or it is not worth having.
  const all = listAllAccounts(
    db,
    { q, plan, minCoaches, hasOpenCase },
    allSort,
    allDirection
  )
  const plans = listPlanLabels(db)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AccountViewFilter counts={viewCounts} />
        <SearchInput placeholder="Search accounts…" />
      </div>

      <p className="text-muted-foreground text-body">{SUBTITLES[shown]}</p>

      <AccountsFilterBar plans={plans} />

      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="account" />
      </div>

      <div className="rounded-xl border">
        <AccountsTable
          rows={rows}
          nameLabel={shown === "prospective" ? "School" : "Account"}
          empty={filtered ? "No accounts match these filters." : EMPTY[shown]}
        />
      </div>

      <section className="mt-3 flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-medium">All schools</h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {all.total > all.rows.length
              ? `showing the first ${all.rows.length} of ${all.total}`
              : `${all.total} ${all.total === 1 ? "school" : "schools"}`}
          </span>
        </div>
        <p className="text-muted-foreground text-body">
          Every staff account and every school a coach typed into their
          profile, down to the ones only one coach named — which the list
          above leaves out.
        </p>
        <div className="rounded-xl border">
          <AccountsTable
            rows={all.rows}
            nameLabel="School"
            empty={
              filtered
                ? "No schools match these filters."
                : "No schools yet: nobody has a staff account, and nobody has typed one into their profile."
            }
            showKind
            scroll
            sortParam="allsort"
            dirParam="alldir"
          />
        </div>
      </section>
    </div>
  )
}
