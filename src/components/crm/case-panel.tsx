"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDownIcon, ChevronUpIcon, HardDriveIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"

import { caseNumber, personLabel } from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"
import type { CasePanelMode } from "@/hooks/use-mobile"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { CasePrioritySelect } from "@/components/crm/case-priority-select"
import { CaseStatusControl } from "@/components/crm/case-status-control"
import { CaseThread } from "@/components/crm/case-thread"
import type { CaseRow } from "@/components/crm/cases-table"
import { CRM_ICON_44 } from "@/components/crm/crm-touch"

export const EDITS_NOTE = "Edits save in this browser"

/**
 * Always shown where status or priority can change (Simmons): on the Cases
 * screen and in the case panel, as well as in the header ⋯ menu.
 */
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

/** Where ↑ / ↓ go, and "3 of 12" among the cases on screen. */
export type CasePanelNav = { index: number; total: number; prevHref: string | null; nextHref: string | null }

/** The literal black scrim (not the scrim token): 40% light, 60% dark. `!` beats Nova's unlayered overlay. */
const SCRIM = "bg-black/40! dark:bg-black/60! backdrop-blur-none!"

function StepLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), CRM_ICON_44)
  if (!href) {
    return (
      <Button variant="ghost" size="icon-sm" className={CRM_ICON_44} aria-label={label} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Link href={href} scroll={false} aria-label={label} className={className}>
      {children}
    </Link>
  )
}

/** Nav row: ↑ ↓, "3 of 12", ×. (No Full page: `/crm/cases/:id` is the panel itself.) */
function NavRow({ nav, onClose, extra }: { nav: CasePanelNav | null; onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div className="border-surface-border flex items-center gap-1 border-b px-2 py-1.5">
      {nav ? (
        <>
          <StepLink href={nav.prevHref} label="Previous case">
            <ChevronUpIcon />
          </StepLink>
          <StepLink href={nav.nextHref} label="Next case">
            <ChevronDownIcon />
          </StepLink>
          <span className="text-muted-foreground ml-1 text-xs tabular-nums" data-testid="case-panel-position">
            {nav.index + 1} of {nav.total}
          </span>
        </>
      ) : null}
      <span className="ml-auto flex items-center gap-1">
        {extra}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close case" title="Close (Esc)" className={CRM_ICON_44}>
          <XIcon />
        </Button>
      </span>
    </div>
  )
}

function PanelBody({ row, nowMs, titleId }: { row: CaseRow; nowMs: number; titleId: string }) {
  const { crmCase: c, live, accountName } = row
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs" data-testid="case-panel-meta">
          {[caseNumber(c.id), personLabel(c.contact), accountName ?? "—"].join(" · ")}
        </p>
        <h2 id={titleId} className="text-base font-semibold tracking-tight break-words">
          {c.subject}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CasePrioritySelect crmCase={c} live={live} />
        <EditsNote className="ml-auto" />
      </div>
      <CaseStatusControl crmCase={c} live={live} />
      <CaseThread caseId={c.id} nowMs={nowMs} />
    </div>
  )
}

function Missing({ titleId }: { titleId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-semibold tracking-tight">
        Case not found
      </h2>
      <p className="text-muted-foreground text-caption">This case is not in the support inbox any more.</p>
    </div>
  )
}

/**
 * A case opened from the Cases list (`?case=<id>`), per Deke's spec §3:
 *
 * - `split` (≥1440): beside the list inside `<main>`, ~480px (Deke's
 *   adjustment of the spec's 560);
 * - `overlay` (1180–1439): a 480px right Sheet with no scrim and not modal,
 *   so the list stays clickable and another row swaps the panel;
 * - `modal` (820–1179): a right Sheet over a 40% / 60% black scrim; Esc,
 *   the scrim or × close it;
 * - `bottom` (<820): a bottom sheet at 55% that grows to 95%. vaul is not a
 *   dependency here, so this is the existing `Sheet side="bottom"` with a
 *   handle that toggles the two heights (no drag snap points).
 *
 * The screen returns focus to the row that opened it.
 */
export function CasePanel({
  row,
  mode,
  nav,
  nowMs,
  onClose,
}: {
  /** null: the id in the URL is not in the inbox. */
  row: CaseRow | null
  mode: CasePanelMode
  nav: CasePanelNav | null
  nowMs: number
  onClose: () => void
}) {
  const titleId = React.useId()
  const [expanded, setExpanded] = React.useState(false)
  const body = row ? <PanelBody row={row} nowMs={nowMs} titleId={titleId} /> : <Missing titleId={titleId} />
  const split = mode === "split"

  React.useEffect(() => {
    if (!split) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      // A picker's own Escape closes its list first.
      if ((event.target as HTMLElement | null)?.closest?.("[role=listbox]")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [split, onClose])

  if (split) {
    return (
      <aside
        aria-labelledby={titleId}
        data-testid="case-panel"
        data-mode={mode}
        className="bg-surface border-surface-border sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col rounded-xl border"
      >
        <NavRow nav={nav} onClose={onClose} />
        <div className="min-w-0 flex-1 overflow-y-auto p-4">{body}</div>
      </aside>
    )
  }

  const title = row ? row.crmCase.subject : "Case not found"
  const bottom = mode === "bottom"
  return (
    <Sheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      // 1180–1439: non-modal, and a click on the list must not close it (it swaps the case instead).
      modal={mode !== "overlay"}
      disablePointerDismissal={mode === "overlay"}
    >
      <SheetContent
        side={bottom ? "bottom" : "right"}
        showCloseButton={false}
        data-testid="case-panel"
        data-mode={mode}
        data-expanded={bottom ? String(expanded) : undefined}
        overlayClassName={mode === "overlay" ? "hidden" : SCRIM}
        // `!`: Nova's `.cn-sheet-content` widths and heights are unlayered.
        className={cn(
          "flex flex-col gap-0 p-0",
          mode === "overlay" && "h-dvh w-[45vw]! max-w-[480px]! shadow-xl",
          mode === "modal" && "h-dvh w-[min(520px,calc(100vw-64px))]! max-w-none!",
          bottom && "max-h-[95dvh] rounded-t-2xl transition-[height] duration-300",
          bottom && (expanded ? "h-[95dvh]!" : "h-[55dvh]!")
        )}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">The case and its thread</SheetDescription>
        {bottom ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Shrink the case sheet" : "Expand the case sheet"}
            aria-expanded={expanded}
            className="flex h-6 w-full shrink-0 items-center justify-center"
          >
            <span aria-hidden className="bg-muted-foreground/40 h-1 w-9 rounded-full" />
          </button>
        ) : null}
        <NavRow
          nav={bottom ? null : nav}
          onClose={onClose}
          extra={
            bottom ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={CRM_ICON_44}
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Shrink" : "Full height"}
              >
                {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button>
            ) : null
          }
        />
        <div className="min-w-0 flex-1 overflow-y-auto p-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
