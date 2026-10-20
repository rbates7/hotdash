"use client"

import * as React from "react"
import Link from "next/link"
import { EllipsisIcon, HardDriveIcon, LockIcon, Trash2Icon } from "lucide-react"

import type { GmailFeed } from "@/lib/crm/gmail-summary"
import { cn } from "@/lib/utils"
import { clearCaseEdits, useCrmEdits } from "@/hooks/use-crm-edits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CLEAR_COPY,
  CLEAR_DESCRIPTION,
  PERSISTENCE_COPY,
  PERSISTENCE_NOTE_NAME,
  persistenceCopy,
} from "@/components/persistence-note"
import { EDITS_NOTE } from "@/components/crm/case-panel"
import { CrmSourceBadge, GMAIL_READ_ONLY_NOTE } from "@/components/crm/crm-source-badge"
import type { useCrm } from "@/components/crm/crm-store"
import { CRM_ICON_44, CRM_ROW_44 } from "@/components/crm/crm-touch"

export const CRM_MENU_LABEL = "CRM menu"
export const GMAIL_CONNECT = "Connect…"

/**
 * The header's ⋯ menu (Deke's spec, "Header actions"): where the CRM's
 * data comes from (Gmail's state, with Connect… when it is not connected)
 * and where edits live (with Clear my entries, behind the shared confirm).
 * The "Edits save in this browser" line also stays on the Cases screen and
 * in the case panel (Simmons), so it is never only in here.
 */
export function CrmHeaderMenu({
  store,
  unauthorized,
  rebuilt,
}: {
  store: ReturnType<typeof useCrm>
  /** The login gate answered 401. */
  unauthorized: boolean
  /** Overview, Cases or Accounts: status and priority edits save in this browser. */
  rebuilt: boolean
}) {
  const [confirming, setConfirming] = React.useState(false)
  const edits = useCrmEdits()
  const gmail: GmailFeed = store.gmail
  const live = gmail.kind === "live"
  const connecting = gmail.kind === "loading" && Boolean(gmail.connecting)
  const caseEdits = Object.keys(edits).length > 0
  // Develop's store saves only while Gmail is not live (the founder's own contacts).
  const ownSaved = !live && store.persisted && store.saved
  const canClear = ownSaved || caseEdits
  const storageNote = (() => {
    // Contacts / Triage while live: develop's store keeps nothing.
    if (live && !rebuilt && !caseEdits) return GMAIL_READ_ONLY_NOTE
    if (!live && !store.persisted) return persistenceCopy(store)
    if (!live && store.saveFailed) return persistenceCopy(store)
    return canClear ? PERSISTENCE_COPY.saved : EDITS_NOTE
  })()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={CRM_MENU_LABEL} title={CRM_MENU_LABEL} className={CRM_ICON_44} />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" data-testid="crm-header-menu">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Gmail</DropdownMenuLabel>
            <div className="flex items-center px-2 py-1.5">
              {unauthorized ? (
                <Badge
                  variant="outline"
                  data-testid="crm-source"
                  data-source="unauthorized"
                  className="text-muted-foreground! h-6 px-2"
                >
                  <LockIcon aria-hidden />
                  Session expired
                </Badge>
              ) : gmail.kind === "loading" && !connecting ? (
                <span className="text-muted-foreground text-xs">Checking…</span>
              ) : (
                <CrmSourceBadge feed={gmail} />
              )}
            </div>
            {gmail.kind === "not_connected" && !unauthorized ? (
              <DropdownMenuItem className={CRM_ROW_44} render={<Link href="/settings#connected-data" />}>
                {GMAIL_CONNECT}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Storage</DropdownMenuLabel>
            <p
              className={cn(
                "text-micro flex items-center gap-1.5 px-2 py-1.5",
                store.saveFailed ? "text-danger-text" : "text-muted-foreground"
              )}
            >
              <HardDriveIcon aria-hidden className="size-3.5" />
              <span
                data-testid={storageNote === GMAIL_READ_ONLY_NOTE ? "crm-read-only" : "persistence-note"}
                role={store.saveFailed ? "alert" : "status"}
                aria-label={PERSISTENCE_NOTE_NAME}
              >
                {storageNote}
              </span>
            </p>
            <DropdownMenuItem
              className={CRM_ROW_44}
              disabled={!canClear || connecting || unauthorized}
              title={canClear ? CLEAR_COPY.tooltip : CLEAR_COPY.disabledHint}
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon aria-hidden />
              {CLEAR_COPY.button}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm!">
          <DialogHeader>
            <DialogTitle>{CLEAR_COPY.title}</DialogTitle>
            <DialogDescription>{CLEAR_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep my edits
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (ownSaved) store.resetDemoData()
                clearCaseEdits()
                setConfirming(false)
              }}
            >
              {CLEAR_COPY.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
