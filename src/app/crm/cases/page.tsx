import { CaseDetail } from "@/components/crm/case-detail"
import { CasePanel } from "@/components/crm/case-panel"
import { CasesFilterBar } from "@/components/crm/cases-filter-bar"
import { CasesTable, type CaseTableRow } from "@/components/crm/cases-table"
import { Pager } from "@/components/crm/pager"
import {
  CASES_PER_PAGE,
  CASE_AUDIENCES,
  CASE_SORTS,
  CASE_WINDOWS,
  getCaseWithTimeline,
  listCases,
  type CaseAudience,
  type CaseSort,
  type CaseWindow,
} from "@/lib/crm/cases/server"
import { caseAgeMs, isOverdue } from "@/lib/crm/cases/age"
import { contactDisplayName } from "@/lib/crm/contacts/server"
import { NotFoundError } from "@/lib/crm/core/errors"
import { isFeedbackThread } from "@/lib/crm/feedback/keys"
import { getDb } from "@/lib/crm/db/client"
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  type CasePriority,
  type CaseStatus,
} from "@/lib/crm/db/schema"
import { formatDuration, relativeTime } from "@/lib/crm/format"

export const metadata = { title: "Cases · CRM · Chlk" }
export const dynamic = "force-dynamic"

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    priority?: string
    q?: string
    offset?: string
    needsReply?: string
    overdue?: string
    window?: string
    audience?: string
    sort?: string
    dir?: string
    /** A case opened beside the list. */
    open?: string
  }>
}) {
  const params = await searchParams
  const db = getDb()
  const status = CASE_STATUSES.includes(params.status as CaseStatus)
    ? (params.status as CaseStatus)
    : undefined
  const priority = CASE_PRIORITIES.includes(params.priority as CasePriority)
    ? (params.priority as CasePriority)
    : undefined
  const q = params.q?.trim() || undefined
  const needsReply = params.needsReply === "1"
  const overdue = params.overdue === "1"
  const window = (
    params.window && params.window in CASE_WINDOWS ? params.window : undefined
  ) as CaseWindow | undefined
  const audience = CASE_AUDIENCES.includes(params.audience as CaseAudience)
    ? (params.audience as CaseAudience)
    : undefined
  const sort = CASE_SORTS.includes(params.sort as CaseSort)
    ? (params.sort as CaseSort)
    : undefined
  const direction = params.dir === "asc" ? "asc" : "desc"

  const parsedOffset = Number(params.offset)
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0
  const { rows, total, limit } = await listCases(db, {
    status,
    priority,
    q,
    needsReply,
    overdue,
    window,
    audience,
    sort,
    direction,
    limit: CASES_PER_PAGE,
    offset,
  })
  // Strings only: the table is a client component, and a Date formatted on
  // the client could differ from the one the server rendered.
  const tableRows: CaseTableRow[] = rows.map((row) => ({
    id: row.id,
    caseNumber: row.caseNumber,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    contactName: contactDisplayName(row.contact),
    organizationName: row.contact.organization?.name ?? null,
    lastActivity: relativeTime(row.lastActivityAt),
    age: row.status === "closed" ? "" : formatDuration(caseAgeMs(row)),
    overdue: isOverdue(row),
    fromApp: isFeedbackThread(row.gmailThreadId),
  }))

  // A case opens beside the list: `?open=<id>` on top of the current
  // filters, so the list stays put and previous / next follow its order.
  const base = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== "open" && value) base.set(key, value)
  }
  const panelQuery = base.toString()
  const hrefFor = (id: string | null) =>
    id
      ? `/crm/cases?${panelQuery ? `${panelQuery}&` : ""}open=${encodeURIComponent(id)}`
      : `/crm/cases${panelQuery ? `?${panelQuery}` : ""}`

  const openId = params.open?.trim() || null
  let openCase = null
  if (openId) {
    try {
      openCase = await getCaseWithTimeline(db, openId)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
  }
  const index = openId ? rows.findIndex((row) => row.id === openId) : -1
  const prevId = index > 0 ? rows[index - 1]!.id : null
  const nextId = index >= 0 && index < rows.length - 1 ? rows[index + 1]!.id : null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CasesFilterBar />
      <div className="flex items-center justify-between gap-3">
        <Pager total={total} limit={limit} offset={offset} noun="case" />
      </div>

      <div
        className={
          openId
            ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-body rounded-xl border px-4 py-12 text-center">
            No cases match these filters.
          </p>
        ) : (
          <CasesTable
            rows={tableRows}
            panelQuery={panelQuery}
            openId={openId}
            compact={Boolean(openId)}
          />
        )}

        {openId ? (
          <CasePanel
            prevHref={prevId ? hrefFor(prevId) : null}
            nextHref={nextId ? hrefFor(nextId) : null}
            closeHref={hrefFor(null)}
            fullHref={`/crm/cases/${encodeURIComponent(openId)}`}
            position={index >= 0 ? `${index + 1} of ${rows.length}` : null}
          >
            {openCase ? (
              <CaseDetail
                caseRow={openCase}
                variant="panel"
                // Closing moves you straight on to the next case; on the
                // last one the panel simply closes.
                afterCloseHref={nextId ? hrefFor(nextId) : hrefFor(null)}
              />
            ) : (
              <p className="text-muted-foreground text-body py-8 text-center">
                That case is gone.
              </p>
            )}
          </CasePanel>
        ) : null}
      </div>
    </div>
  )
}
