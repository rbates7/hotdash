"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRightIcon, InboxIcon, Trash2Icon } from "lucide-react"

import {
  PRIORITY_LABELS,
  contactDisplayName,
  filterCases,
  formatCrmRelative,
  orgOf,
  type Case,
  type Contact,
  type Organization,
} from "@/lib/crm/crm"
import { isSeedCase } from "@/lib/crm/fixture"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard, Who } from "@/components/table-bits"
import { ResponsiveTable, RowCollapse, type RowCollapseMeta } from "@/components/responsive-table"
import { SampleDataTag } from "@/components/sample-data"
import { PriorityBadge, StatusBadge } from "@/components/crm/case-badges"
import { CasesFilterBar, caseFilterFromSearch } from "@/components/crm/cases-filter-bar"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { CaseDeleteDialog } from "@/components/crm/crm-delete-dialogs"
import {
  CARD,
  CARD_LIST,
  RecordSheet,
  RowMenu,
  SHEET_ACTION,
  useDeferredAction,
  useListFocus,
  useRowDialogs,
} from "@/components/crm/crm-row-actions"
import { clearListReturn, rememberListReturn } from "@/components/crm/crm-return"
import { useCrm } from "@/components/crm/crm-store"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

/**
 * The phone card's two lines (Deke 7:47): "#N · Contact · Org" (email when
 * there is no org) and "Priority priority · last activity".
 */
export function caseCardMeta(
  caseRow: Case,
  contact: Contact | undefined,
  org: Organization | null,
  nowMs: number
): RowCollapseMeta[] {
  const who = [contact ? contactDisplayName(contact) : "Unknown", org?.name ?? contact?.email]
  return [
    { label: "Case", value: [`#${caseRow.caseNumber}`, ...who].filter(Boolean).join(" · ") },
    {
      label: "Priority",
      value: `${PRIORITY_LABELS[caseRow.priority]} priority · ${formatCrmRelative(caseRow.lastActivityAt, nowMs)}`,
    },
  ]
}

/** Tablet (768–1279) folds # and Last activity into the Subject cell. */
const TABLET_HIDE = "md:max-xl:hidden"
/** The "…" column exists only on tablet. */
const TABLET_ONLY = "hidden md:max-xl:table-cell"
/** Tablet cells wrap so the columns fit 768px; `!` beats Nova's nowrap. */
const TABLET_WRAP = "md:max-xl:[&>td]:whitespace-normal!"

type CaseAction = "delete"

/** Tablet: one 44×44 "…" with the phone sheet's actions. */
function CaseRowMenu({ caseRow, onDelete }: { caseRow: Case; onDelete: (caseRow: Case) => void }) {
  const router = useRouter()
  return (
    <RowMenu
      label={`More actions for #${caseRow.caseNumber} ${caseRow.subject}`}
      items={[
        {
          label: "Open case",
          icon: <ArrowRightIcon aria-hidden />,
          onSelect: () => {
            rememberListReturn(`/crm/cases/${caseRow.id}`)
            router.push(`/crm/cases/${caseRow.id}`)
          },
        },
        {
          label: "Delete case",
          icon: <Trash2Icon aria-hidden />,
          destructive: true,
          onSelect: () => onDelete(caseRow),
        },
      ]}
    />
  )
}

/**
 * Phone (<768): the card's row menu as a bottom sheet (Deke 7:83). Open case
 * goes to the detail page, where status, priority and notes live; Delete
 * opens the same confirm the detail page uses.
 */
function CaseSheet({
  caseRow: current,
  open,
  onOpenChange,
  backToCard,
}: {
  caseRow: Case | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  backToCard: () => HTMLElement | true
}) {
  const store = useCrm()
  const { action, queue, flush, clear } = useDeferredAction<CaseAction>()
  // Keep the last case shown so the Delete confirm can finish closing (and
  // hand focus on) after the case itself has left the store.
  const [shown, setShown] = React.useState(current)
  if (current && current !== shown) setShown(current)
  const caseRow = current ?? shown
  if (!caseRow) return null
  const contact = store.contactById(caseRow.contactId)
  const org = contact ? orgOf(store.organizations, contact.organizationId) : null
  return (
    <>
      <RecordSheet
        open={open}
        onOpenChange={onOpenChange}
        onClosed={flush}
        finalFocus={backToCard}
        title={caseRow.subject}
        pill={<StatusBadge status={caseRow.status} />}
        lines={caseCardMeta(caseRow, contact, org, store.nowMs).map((line) => line.value)}
        actionsLabel="Case actions"
      >
        <Link
          href={`/crm/cases/${caseRow.id}`}
          className={SHEET_ACTION}
          onClick={(event) => {
            rememberListReturn(`/crm/cases/${caseRow.id}`, event)
            onOpenChange(false)
          }}
        >
          <ArrowRightIcon aria-hidden />
          Open case
        </Link>
        <button
          type="button"
          className={cn(SHEET_ACTION, "text-danger-text")}
          onClick={() => {
            queue("delete")
            onOpenChange(false)
          }}
        >
          <Trash2Icon aria-hidden />
          Delete case
        </button>
      </RecordSheet>
      {/* Opens after the sheet closes; it returns to the card (or the next one) too. */}
      <CaseDeleteDialog
        caseRow={caseRow}
        open={action === "delete"}
        onOpenChange={(next) => {
          if (!next) clear()
        }}
        finalFocus={backToCard}
      />
    </>
  )
}

export function CasesScreen() {
  const store = useCrm()
  const searchParams = useSearchParams()
  const filter = caseFilterFromSearch(searchParams)
  const rows = filterCases(store.cases, store.contacts, store.organizations, filter)
  const filtered = Boolean(filter.status || filter.priority || filter.q)
  const { rootRef, onCardClickCapture, onMenuClickCapture, backToCard, afterMenuDelete } =
    useListFocus()
  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const rowDialog = useRowDialogs<Case, CaseAction>()
  // Back on the list: any recorded way back has been used or is stale.
  React.useEffect(() => clearListReturn(), [])

  if (!store.persisted) return <CrmTableSkeleton label="Loading saved cases" />

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 data-crm-list-heading tabIndex={-1} className="text-title-sm font-semibold tracking-tight">
          Cases
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {rows.length} {rows.length === 1 ? "case" : "cases"}
          {filtered ? " matching filters" : ""}
        </p>
      </div>
      <CasesFilterBar />
      {store.cases.length === 0 ? (
        <div
          role="status"
          aria-label="No cases"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <InboxIcon className="text-faint-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No cases</p>
          <p className="text-caption">
            Every case has been removed. Promote a triage thread, or Reset to bring the sample
            cases back.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          aria-label="No matching cases"
          className="text-muted-foreground px-4 py-12 text-center text-sm"
        >
          No cases match these filters.
        </p>
      ) : (
        <TableCard note="Seed conversations dated from today. Cases you add or promote are yours.">
          <ResponsiveTable
            layout="stack"
            className={CARD_LIST}
            onClickCapture={(event) => {
              onCardClickCapture(event)
              onMenuClickCapture(event)
            }}
            stacked={rows.map((row) => {
              const contact = store.contactById(row.contactId)
              const org = contact ? orgOf(store.organizations, contact.organizationId) : null
              return (
                <RowCollapse
                  key={row.id}
                  title={row.subject}
                  status={<StatusBadge status={row.status} />}
                  meta={caseCardMeta(row, contact, org, store.nowMs)}
                  sample={isSeedCase(row.id)}
                  className={CARD}
                  onClick={() => {
                    setSheetId(row.id)
                    setSheetOpen(true)
                  }}
                />
              )
            })}
          >
          <Table aria-label="Cases">
            <TableHeader>
              <TableRow>
                <TableHead className={cn(`${HEAD} w-16`, TABLET_HIDE)}>#</TableHead>
                <TableHead className={HEAD}>Subject</TableHead>
                <TableHead className={HEAD}>Contact</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Priority</TableHead>
                <TableHead className={cn(`${HEAD} text-right`, TABLET_HIDE)}>Last activity</TableHead>
                <TableHead className={cn(HEAD, TABLET_ONLY, "w-14")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const contact = store.contactById(row.contactId)
                const org = contact ? orgOf(store.organizations, contact.organizationId) : null
                const name = contact ? contactDisplayName(contact) : "Unknown"
                const lastActivity = formatCrmRelative(row.lastActivityAt, store.nowMs)
                const sample = isSeedCase(row.id)
                return (
                  <TableRow key={row.id} data-case={row.id} className={TABLET_WRAP}>
                    <TableCell className={cn(`${CELL} text-muted-foreground`, TABLET_HIDE)}>
                      <Link href={`/crm/cases/${row.id}`} onClick={(event) => rememberListReturn(`/crm/cases/${row.id}`, event)}>
                        #{row.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell className={`${CELL} max-w-96`}>
                      <Link
                        href={`/crm/cases/${row.id}`}
                        onClick={(event) => rememberListReturn(`/crm/cases/${row.id}`, event)}
                        className="flex items-center gap-2 font-medium hover:underline md:max-xl:min-h-11 md:max-xl:flex-wrap md:max-xl:gap-x-1.5 md:max-xl:gap-y-0.5 md:max-xl:py-1"
                      >
                        <span className="truncate md:max-xl:basis-full md:max-xl:whitespace-normal">
                          {row.subject}
                        </span>
                        {/* Tablet subline (Deke 8:665): "#N · 2h ago", then the same tag wraps beside it. */}
                        <span className="text-caption text-muted-foreground hidden font-normal md:max-xl:inline">
                          {`#${row.caseNumber} · ${lastActivity}`}
                        </span>
                        {sample ? <SampleDataTag /> : null}
                      </Link>
                    </TableCell>
                    <TableCell className={CELL}>
                      <span className="flex items-center gap-2 md:max-xl:[&>div]:min-w-0 md:max-xl:[&_p]:max-w-40 md:max-xl:[&_p]:[overflow-wrap:anywhere]">
                        <CrmAvatar
                          firstName={contact?.firstName}
                          lastName={contact?.lastName}
                          email={contact?.email}
                        />
                        <Who name={name} email={org?.name ?? contact?.email ?? ""} />
                      </span>
                    </TableCell>
                    <TableCell className={CELL}>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className={CELL}>
                      <PriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell className={cn(`${CELL} text-muted-foreground text-right`, TABLET_HIDE)}>
                      {lastActivity}
                    </TableCell>
                    <TableCell className={cn(CELL, TABLET_ONLY, "py-2 pr-3 pl-0 text-right")}>
                      <CaseRowMenu caseRow={row} onDelete={(c) => rowDialog.open(c, "delete")} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </TableCard>
      )}
      <CaseSheet
        caseRow={store.cases.find((c) => c.id === sheetId)}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        backToCard={backToCard}
      />
      {rowDialog.target ? (
        <CaseDeleteDialog
          caseRow={rowDialog.target}
          open={rowDialog.action === "delete"}
          onOpenChange={(open) => {
            if (!open) rowDialog.close()
          }}
          // The next row's "…" once this row is gone, else the heading.
          finalFocus={afterMenuDelete}
        />
      ) : null}
    </div>
  )
}
