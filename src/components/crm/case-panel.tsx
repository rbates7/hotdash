"use client"

import * as React from "react"
import { HardDriveIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { CasePrioritySelect } from "@/components/crm/case-priority-select"
import { CaseStatusSelect } from "@/components/crm/case-status-select"
import { CaseThread } from "@/components/crm/case-thread"
import { contactLabel, type CaseRow } from "@/components/crm/cases-table"
import { CRM_ICON_44 } from "@/components/crm/crm-touch"

export const EDITS_NOTE = "Edits save in this browser"

/** Always shown where status or priority can change: Gmail is not written to. */
export function EditsNote({ className }: { className?: string }) {
  return (
    <p
      data-testid="crm-edits-note"
      className={cn("text-micro text-muted-foreground flex items-center gap-1.5 tracking-tight", className)}
      title="Status and priority changes stay in this browser; Gmail is never written to."
    >
      <HardDriveIcon aria-hidden className="size-3.5" />
      {EDITS_NOTE}
    </p>
  )
}

function PanelBody({ row, nowMs, titleId }: { row: CaseRow; nowMs: number; titleId: string }) {
  const { crmCase: c, live, accountName } = row
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs">
          {[contactLabel(c), c.contact.name ? c.contact.email : null, accountName].filter(Boolean).join(" · ")}
        </p>
        <h2 id={titleId} className="text-title font-semibold tracking-tight break-words">
          {c.subject}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CaseStatusSelect crmCase={c} live={live} />
        <CasePrioritySelect crmCase={c} live={live} />
      </div>
      <EditsNote />
      <CaseThread caseId={c.id} nowMs={nowMs} />
    </div>
  )
}

function Missing({ titleId }: { titleId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={titleId} className="text-title font-semibold tracking-tight">
        Case not found
      </h2>
      <p className="text-muted-foreground text-caption">This case is not in the support inbox any more.</p>
    </div>
  )
}

/**
 * A case opened beside the Cases list (≥1280), or in a full-height sheet
 * below that. crm-port's panel frame, trimmed to what Gmail can back:
 * subject, contact and account, the status and priority pickers, the
 * browser-edit note and the sanitized thread. Esc and the × close it; the
 * screen returns focus to the row that opened it.
 */
export function CasePanel({
  row,
  docked,
  nowMs,
  onClose,
}: {
  /** null: the id in the URL is not in the inbox. */
  row: CaseRow | null
  /** Beside the list (≥1280) rather than in a sheet. */
  docked: boolean
  nowMs: number
  onClose: () => void
}) {
  const titleId = React.useId()
  const body = row ? <PanelBody row={row} nowMs={nowMs} titleId={titleId} /> : <Missing titleId={titleId} />

  React.useEffect(() => {
    if (!docked) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      // A picker's own Escape closes its list first.
      if ((event.target as HTMLElement | null)?.closest?.("[role=listbox]")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [docked, onClose])

  if (docked) {
    return (
      <aside
        aria-labelledby={titleId}
        data-testid="case-panel"
        className="bg-surface border-surface-border flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col rounded-xl border xl:sticky xl:top-4"
      >
        <div className="flex items-center justify-end border-b px-2 py-1.5">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close case" title="Close (Esc)">
            <XIcon />
          </Button>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">{body}</div>
      </aside>
    )
  }

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-testid="case-panel"
        className="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetTitle className="sr-only">{row ? row.crmCase.subject : "Case not found"}</SheetTitle>
        <SheetDescription className="sr-only">The case and its thread</SheetDescription>
        <div className="flex items-center justify-end border-b px-2 py-1.5">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close case" className={CRM_ICON_44}>
            <XIcon />
          </Button>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
