"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRightIcon, PencilIcon, SearchIcon, Trash2Icon, UsersIcon } from "lucide-react"

import {
  contactDisplayName,
  filterContacts,
  openCaseCount,
  orgOf,
  type Contact,
  type Organization,
} from "@/lib/crm/crm"
import { isSeedContact } from "@/lib/crm/fixture"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CELL, HEAD, TableCard } from "@/components/table-bits"
import { ResponsiveTable, RowCollapse, type RowCollapseMeta } from "@/components/responsive-table"
import { SampleDataTag } from "@/components/sample-data"
import { PlanBadge } from "@/components/crm/case-badges"
import { ContactEditDialog, ContactNewDialog } from "@/components/crm/contact-dialogs"
import { CrmAvatar } from "@/components/crm/crm-avatar"
import { ContactDeleteDialog } from "@/components/crm/crm-delete-dialogs"
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
import { CRM_44 } from "@/components/crm/crm-touch"

/**
 * The phone card's two lines (Deke 7:47): the email, then
 * "Organization · N open cases".
 */
export function contactCardMeta(
  contact: Contact,
  org: Organization | null,
  openCases: number
): RowCollapseMeta[] {
  return [
    { label: "Email", value: contact.email },
    {
      label: "Organization",
      value: `${org?.name ?? "No organization"} · ${openCases} open ${openCases === 1 ? "case" : "cases"}`,
    },
  ]
}

/** The card and sheet plan pill; `plan-pill` stays the table column's. */
export const CARD_PLAN_PILL = "card-plan-pill"

/** Tablet (768–1279) folds Email under Name. */
const TABLET_HIDE = "md:max-xl:hidden"
/** The "…" column exists only on tablet. */
const TABLET_ONLY = "hidden md:max-xl:table-cell"
/** Tablet cells wrap so the table fits 768px; `!` beats Nova's unlayered nowrap. */
const TABLET_WRAP = "md:max-xl:[&>td]:whitespace-normal!"

type ContactAction = "edit" | "delete"

/** Edit and Delete, opened from the phone sheet or the tablet row menu. */
function ContactActionDialogs({
  contact,
  action,
  onClose,
  finalFocus,
}: {
  contact: Contact
  action: ContactAction | null
  onClose: () => void
  finalFocus: () => HTMLElement | true
}) {
  const { organizations } = useCrm()
  const close = (open: boolean) => {
    if (!open) onClose()
  }
  return (
    <>
      <ContactEditDialog
        contact={contact}
        organizationName={orgOf(organizations, contact.organizationId)?.name ?? null}
        open={action === "edit"}
        onOpenChange={close}
        finalFocus={finalFocus}
      />
      <ContactDeleteDialog
        contactId={contact.id}
        name={contactDisplayName(contact)}
        open={action === "delete"}
        onOpenChange={close}
        finalFocus={finalFocus}
      />
    </>
  )
}

/** Tablet: one 44×44 "…" with the phone sheet's actions. */
function ContactRowMenu({
  contact,
  onAction,
}: {
  contact: Contact
  onAction: (contact: Contact, action: ContactAction) => void
}) {
  const router = useRouter()
  return (
    <RowMenu
      label={`More actions for ${contactDisplayName(contact)}`}
      items={[
        {
          label: "Open contact",
          icon: <ArrowRightIcon aria-hidden />,
          onSelect: () => {
            rememberListReturn(`/crm/contacts/${contact.id}`)
            router.push(`/crm/contacts/${contact.id}`)
          },
        },
        {
          label: "Edit contact",
          icon: <PencilIcon aria-hidden />,
          onSelect: () => onAction(contact, "edit"),
        },
        {
          label: "Delete contact",
          icon: <Trash2Icon aria-hidden />,
          destructive: true,
          onSelect: () => onAction(contact, "delete"),
        },
      ]}
    />
  )
}

/** Phone (<768): the card's row menu as a bottom sheet (Deke 7:83). */
function ContactSheet({
  contact: current,
  open,
  onOpenChange,
  backToCard,
}: {
  contact: Contact | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  backToCard: () => HTMLElement | true
}) {
  const store = useCrm()
  const { action, queue, flush, clear } = useDeferredAction<ContactAction>()
  // Keep the last contact shown so the Delete confirm can finish closing.
  const [shown, setShown] = React.useState(current)
  if (current && current !== shown) setShown(current)
  const contact = current ?? shown
  if (!contact) return null
  const org = orgOf(store.organizations, contact.organizationId)
  const pick = (next: ContactAction) => () => {
    queue(next)
    onOpenChange(false)
  }
  return (
    <>
      <RecordSheet
        open={open}
        onOpenChange={onOpenChange}
        onClosed={flush}
        finalFocus={backToCard}
        title={contactDisplayName(contact)}
        pill={
          contact.plan ? (
            <PlanBadge plan={contact.plan} planStatus={contact.planStatus} testId={CARD_PLAN_PILL} />
          ) : undefined
        }
        lines={contactCardMeta(contact, org, openCaseCount(store.cases, contact.id)).map((line) => line.value)}
        actionsLabel="Contact actions"
      >
        <Link
          href={`/crm/contacts/${contact.id}`}
          className={SHEET_ACTION}
          onClick={() => {
            rememberListReturn(`/crm/contacts/${contact.id}`)
            onOpenChange(false)
          }}
        >
          <ArrowRightIcon aria-hidden />
          Open contact
        </Link>
        <button type="button" className={SHEET_ACTION} onClick={pick("edit")}>
          <PencilIcon aria-hidden />
          Edit contact
        </button>
        <button type="button" className={cn(SHEET_ACTION, "text-danger-text")} onClick={pick("delete")}>
          <Trash2Icon aria-hidden />
          Delete contact
        </button>
      </RecordSheet>
      {/* Opens after the sheet closes; it returns to the card (or the next one) too. */}
      <ContactActionDialogs contact={contact} action={action} onClose={clear} finalFocus={backToCard} />
    </>
  )
}

export function ContactsScreen() {
  const store = useCrm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = React.useState(searchParams.get("q") ?? "")
  const rows = filterContacts(store.contacts, store.organizations, q)
  const { rootRef, onCardClickCapture, onMenuClickCapture, backToCard, afterMenuDelete } =
    useListFocus()
  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const rowDialog = useRowDialogs<Contact, ContactAction>()
  // Back on the list: any recorded way back has been used or is stale.
  React.useEffect(() => clearListReturn(), [])

  React.useEffect(() => {
    const current = searchParams.get("q") ?? ""
    if (q === current) return
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q.trim()) params.set("q", q)
      else params.delete("q")
      const qs = params.toString()
      router.replace(qs ? `/crm/contacts?${qs}` : "/crm/contacts")
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, router, searchParams])

  if (!store.persisted) return <CrmTableSkeleton label="Loading saved contacts" />

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 data-crm-list-heading tabIndex={-1} className="text-title-sm font-semibold tracking-tight">
            Contacts
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {q.trim() ? " matching search" : " — sample rows, plus anyone you add"}
          </p>
        </div>
        <ContactNewDialog />
      </div>
      <div className="relative w-56 max-md:w-full">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search contacts…"
          aria-label="Search contacts"
          className={cn("h-8 pl-8!", CRM_44)}
        />
      </div>

      {store.contacts.length === 0 ? (
        <div
          role="status"
          aria-label="No contacts"
          className="border-surface-border text-muted-foreground flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center"
        >
          <UsersIcon className="text-faint-foreground size-6" aria-hidden />
          <p className="text-body text-foreground font-medium">No contacts</p>
          <p className="text-caption">
            Every contact has been removed. Add one, or Reset to bring the sample people back.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          aria-label="No matching contacts"
          className="text-muted-foreground px-4 py-12 text-center text-sm"
        >
          No contacts match this search.
        </p>
      ) : (
        <TableCard note="Seed people dated from today. Contacts you add or promote are yours.">
          <ResponsiveTable
            layout="stack"
            className={CARD_LIST}
            onClickCapture={(event) => {
              onCardClickCapture(event)
              onMenuClickCapture(event)
            }}
            stacked={rows.map((contact) => (
              <RowCollapse
                key={contact.id}
                title={contactDisplayName(contact)}
                status={
                  contact.plan ? (
                    <PlanBadge plan={contact.plan} planStatus={contact.planStatus} testId={CARD_PLAN_PILL} />
                  ) : undefined
                }
                meta={contactCardMeta(
                  contact,
                  orgOf(store.organizations, contact.organizationId),
                  openCaseCount(store.cases, contact.id)
                )}
                sample={isSeedContact(contact.id)}
                className={CARD}
                onClick={() => {
                  setSheetId(contact.id)
                  setSheetOpen(true)
                }}
              />
            ))}
          >
          <Table aria-label="Contacts">
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={cn(HEAD, TABLET_HIDE)}>Email</TableHead>
                <TableHead className={HEAD}>Organization</TableHead>
                <TableHead className={HEAD}>Plan</TableHead>
                <TableHead className={`${HEAD} text-right`}>Open cases</TableHead>
                <TableHead className={cn(HEAD, TABLET_ONLY, "w-14")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((contact) => {
                const org = orgOf(store.organizations, contact.organizationId)
                const name = contactDisplayName(contact)
                return (
                  <TableRow key={contact.id} data-contact={contact.id} className={TABLET_WRAP}>
                    <TableCell className={CELL}>
                      <Link
                        href={`/crm/contacts/${contact.id}`}
                        onClick={() => rememberListReturn(`/crm/contacts/${contact.id}`)}
                        className="flex items-center gap-2 font-medium hover:underline md:max-xl:min-h-11 md:max-xl:flex-wrap"
                      >
                        <CrmAvatar
                          firstName={contact.firstName}
                          lastName={contact.lastName}
                          email={contact.email}
                        />
                        <span className="truncate md:max-xl:min-w-0 md:max-xl:whitespace-normal md:max-xl:[overflow-wrap:anywhere]">{name}</span>
                        {isSeedContact(contact.id) ? <SampleDataTag /> : null}
                      </Link>
                      {/* Tablet: Email folds under Name. */}
                      <span className="text-caption text-muted-foreground hidden pl-8 md:max-xl:block md:max-xl:[overflow-wrap:anywhere]">
                        {contact.email}
                      </span>
                    </TableCell>
                    <TableCell className={cn(`${CELL} text-muted-foreground`, TABLET_HIDE)}>
                      {contact.email}
                    </TableCell>
                    <TableCell className={`${CELL} text-muted-foreground`}>
                      {org?.name ?? "—"}
                    </TableCell>
                    <TableCell className={CELL}>
                      <PlanBadge plan={contact.plan} planStatus={contact.planStatus} />
                    </TableCell>
                    <TableCell className={`${CELL} text-right`}>
                      {openCaseCount(store.cases, contact.id) || (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className={cn(CELL, TABLET_ONLY, "py-2 pr-3 pl-0 text-right")}>
                      <ContactRowMenu contact={contact} onAction={rowDialog.open} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </TableCard>
      )}
      <ContactSheet
        contact={store.contacts.find((c) => c.id === sheetId)}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        backToCard={backToCard}
      />
      {rowDialog.target ? (
        <ContactActionDialogs
          contact={rowDialog.target}
          action={rowDialog.action}
          onClose={rowDialog.close}
          // Edit keeps the row, so focus goes back to its "…"; Delete moves to the next row's.
          finalFocus={afterMenuDelete}
        />
      ) : null}
    </div>
  )
}
