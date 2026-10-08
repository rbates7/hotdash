"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ChevronRightIcon, TicketPlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { formatDate, formatRelative } from "@/lib/clock"
import {
  COLUMN_CONFIG,
  COLUMN_ORDER,
  DEFAULT_OWNER,
  MAX_TITLE,
  MAX_WHY,
  MAX_WINDOW,
  OWNERS,
  isColumn,
  isOwner,
  type RoadmapColumn,
  type RoadmapItem,
  type RoadmapOwner,
} from "@/lib/roadmap/roadmap"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { ticketsLabel } from "@/components/product-roadmap/roadmap-card"
import {
  ROADMAP_CONFIRM_DELETE,
  ROADMAP_DELETE,
  ROADMAP_ICON,
  ROADMAP_INPUT,
  ROADMAP_OPTION,
  ROADMAP_PRESSED,
  ROADMAP_SHEET,
  ROADMAP_SHEET_HANDLE,
  ROADMAP_TEXTAREA,
  ROADMAP_TITLE,
  ROADMAP_TOUCH,
} from "@/components/product-roadmap/responsive"
import { SampleDataTag } from "@/components/sample-data"
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile"

export type BetCloseReason = "dismiss" | "delete" | "move"

export const SPAWN_TICKET_LABEL = "Spawn ticket (soon)"
export const SPAWN_TICKET_TITLE =
  "Will create an Agent Workplace ticket linked to this bet. Not wired yet — tickets still start on the Issues board."

/**
 * Base UI wraps Tab at the dialog's ends through a focus guard and a
 * requestAnimationFrame, so for a frame focus sits outside the sheet. Own
 * the whole Tab cycle synchronously (Sales #29 wrap, plus mid-list steps)
 * so Playwright never samples the guard.
 */
function tabbablesIn(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]"
    )
  ).filter((el) => {
    if (el === root) return false
    if (el.closest("[data-base-ui-focus-guard]")) return false
    if ("disabled" in el && (el as HTMLButtonElement).disabled) return false
    if (el.tabIndex < 0) return false
    if (el.getAttribute("aria-hidden") === "true") return false
    const r = el.getClientRects()
    return r.length > 0 && r[0]!.width > 0 && r[0]!.height > 0
  })
}

function wrapTabAt(root: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return
  const tabbable = tabbablesIn(root)
  if (tabbable.length === 0) return
  const current = document.activeElement
  const idx = current instanceof HTMLElement ? tabbable.indexOf(current) : -1
  const target = event.shiftKey
    ? tabbable[idx <= 0 ? tabbable.length - 1 : idx - 1]
    : tabbable[idx === -1 || idx === tabbable.length - 1 ? 0 : idx + 1]
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
  target.focus()
}

function popupIsOpen(root: HTMLElement) {
  if (!root.isConnected) return false
  if (root.closest("[data-closed]")) return false
  return root.getClientRects().length > 0
}

function RoadmapDialogContent({
  className,
  children,
  onKeyDown,
  showStockClose,
  trapFocus,
  sheetOverlay,
  finalFocus,
}: {
  className?: string
  children: React.ReactNode
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>
  showStockClose?: boolean
  /** Own Tab only while the compact sheet/dialog is open — never on desktop. */
  trapFocus?: boolean
  /** Phone sheet backdrop; desktop keeps develop's `dialog-overlay`. */
  sheetOverlay?: boolean
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"]
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useLayoutEffect(() => {
    if (!trapFocus) return
    const onKey = (event: KeyboardEvent) => {
      const root = ref.current
      if (root && popupIsOpen(root)) wrapTabAt(root, event)
    }
    const onFocusIn = (event: FocusEvent) => {
      const root = ref.current
      const next = event.target
      if (!root || !popupIsOpen(root) || !(next instanceof Node) || root.contains(next)) return
      const list = tabbablesIn(root)
      if (list.length === 0) return
      list[0]!.focus()
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("focusin", onFocusIn, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("focusin", onFocusIn, true)
    }
  }, [trapFocus])

  return (
    <DialogPortal>
      <DialogOverlay data-slot={sheetOverlay ? "sheet-overlay" : "dialog-overlay"} />
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          "cn-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className
        )}
        onKeyDown={onKeyDown}
        finalFocus={finalFocus}
      >
        {children}
        {showStockClose && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className={cn("cn-dialog-close", ROADMAP_ICON)}
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

const DIALOG_CLASS =
  // Nova's .cn-dialog-content pins sm:max-w-sm, so the override has to be
  // scoped to the same breakpoint and marked important to win. On phone the
  // same dialog docks as a bottom sheet (Deke: no dedicated sheet frame).
  // Tablet (md–xl) stays a centered dialog but must fit the viewport.
  `bg-surface w-full sm:max-w-xl! overflow-hidden rounded-xl border p-0! gap-0! shadow-lg md:max-xl:max-h-[calc(100dvh-2rem)] md:max-xl:overflow-y-auto ${ROADMAP_SHEET}`

/** Develop's Owner / Column pressed fill. Unchanged at xl+ for the pixel diff. */
const DESKTOP_PRESSED =
  "aria-pressed:bg-brand/12! aria-pressed:text-foreground! aria-pressed:border-brand/40!"

function SheetHandle() {
  return <div aria-hidden className={ROADMAP_SHEET_HANDLE} />
}

function Crumbs({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-4 max-md:pt-2 max-xl:pr-14">
      <span className="text-caption text-muted-foreground">Product Roadmap</span>
      <ChevronRightIcon className="text-faint-foreground size-3.5" aria-hidden />
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-micro text-muted-foreground font-medium tracking-wide uppercase">
      {children}
    </span>
  )
}

function OwnerPicker({
  value,
  onChange,
}: {
  value: RoadmapOwner
  onChange: (owner: RoadmapOwner) => void
}) {
  const compact = useCompact()
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Owner</FieldLabel>
      <ToggleGroup
        aria-label="Owner"
        variant="outline"
        size="sm"
        value={[value]}
        onValueChange={(next) => {
          // Single-select: ignore the empty array from re-clicking the
          // pressed item so an owner is always chosen.
          if (isOwner(next[0])) onChange(next[0])
        }}
      >
        {OWNERS.map((owner) => (
          <ToggleGroupItem
            key={owner}
            value={owner}
            className={cn(compact ? ROADMAP_PRESSED : DESKTOP_PRESSED, ROADMAP_OPTION)}
          >
            {owner}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function WindowField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>Target window</FieldLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_WINDOW}
        placeholder="Q4 2026 · Nov 2026 · 2027"
        aria-label="Target window"
        className={cn(
          "border-border text-body bg-background rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          ROADMAP_INPUT,
          "w-44"
        )}
      />
    </label>
  )
}

/** The dialog's close control. Base UI's close is a child so Esc still works. */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Close" className="ml-auto" onClick={onClick}>
      <XIcon />
    </Button>
  )
}

function useCompact() {
  const phone = useIsMobile()
  const tablet = useIsTablet()
  return phone || tablet
}

/* ---------------------------------------------------------------- new bet */

export function NewBetDialog({ trigger }: { trigger: React.ReactElement }) {
  const { addItem } = useRoadmap()
  const phone = useIsMobile()
  const compact = useCompact()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [why, setWhy] = React.useState("")
  const [owner, setOwner] = React.useState<RoadmapOwner>(DEFAULT_OWNER)
  const [targetWindow, setWindow] = React.useState("")
  const [column, setColumn] = React.useState<RoadmapColumn>("later")

  function reset() {
    setTitle("")
    setWhy("")
    setOwner(DEFAULT_OWNER)
    setWindow("")
    setColumn("later")
  }

  function submit() {
    if (!title.trim()) return
    addItem({ title, why, owner, window: targetWindow, column })
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <RoadmapDialogContent
        className={DIALOG_CLASS}
        showStockClose={compact}
        trapFocus={compact && open}
        sheetOverlay={phone && open}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            submit()
          }
        }}
      >
        <SheetHandle />
        <Crumbs>
          <DialogTitle className="text-caption font-medium">New bet</DialogTitle>
          {compact ? null : <CloseButton onClick={() => setOpen(false)} />}
        </Crumbs>
        <DialogDescription className="sr-only">
          Add a signed bet to the roadmap. Pick the column it lands in; sequence it from the card.
        </DialogDescription>

        <div className="flex flex-col gap-3 px-4 pt-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="What's the bet?"
            aria-label="Bet title"
            className={cn(
              "text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none",
              ROADMAP_TITLE
            )}
          />
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            maxLength={MAX_WHY}
            placeholder="Why it matters, in one line."
            aria-label="Why it matters"
            rows={3}
            className={cn(
              "text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none",
              ROADMAP_TEXTAREA
            )}
          />
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <OwnerPicker value={owner} onChange={setOwner} />
            <WindowField value={targetWindow} onChange={setWindow} />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Column</FieldLabel>
            <ToggleGroup
              aria-label="Column"
              variant="outline"
              size="sm"
              value={[column]}
              onValueChange={(next) => {
                if (isColumn(next[0])) setColumn(next[0])
              }}
            >
              {COLUMN_ORDER.map((c) => (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  title={COLUMN_CONFIG[c].description}
                  className={cn(compact ? ROADMAP_PRESSED : DESKTOP_PRESSED, ROADMAP_OPTION)}
                >
                  {COLUMN_CONFIG[c].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-caption text-muted-foreground">{COLUMN_CONFIG[column].description}</p>
          </div>
        </div>

        <div className="border-border mt-4 flex items-center justify-end gap-3 border-t px-4 py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" size="sm" className={ROADMAP_TOUCH} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className={ROADMAP_TOUCH} onClick={submit} disabled={!title.trim()}>
            Add bet
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </RoadmapDialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------------- edit bet */

export function EditBetDialog({
  item,
  onClose,
}: {
  /** The bet being edited; `null` closes the dialog. */
  item: RoadmapItem | null
  onClose: (reason?: BetCloseReason) => void
}) {
  const { patchItem, removeItem, moveItem } = useRoadmap()

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) onClose("dismiss")
      }}
    >
      {item && (
        <EditBetBody
          // Remount per bet so draft state never leaks between them.
          key={item.id}
          item={item}
          onClose={onClose}
          onSave={(patch) => patchItem(item.id, patch)}
          onDelete={() => removeItem(item.id)}
          onMove={(column) => moveItem(item.id, column)}
        />
      )}
    </Dialog>
  )
}

function EditBetBody({
  item,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  item: RoadmapItem
  onClose: (reason?: BetCloseReason) => void
  onSave: (patch: { title: string; why: string; owner: RoadmapOwner; window: string }) => void
  onDelete: () => void
  onMove: (column: RoadmapColumn) => void
}) {
  const { nowMs } = useRoadmap()
  const phone = useIsMobile()
  const compact = useCompact()
  const [title, setTitle] = React.useState(item.title)
  const [why, setWhy] = React.useState(item.why)
  const [owner, setOwner] = React.useState<RoadmapOwner>(item.owner)
  const [targetWindow, setWindow] = React.useState(item.window)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const dirty =
    title.trim() !== item.title ||
    why.trim() !== item.why ||
    owner !== item.owner ||
    targetWindow.trim() !== item.window
  const canSave = dirty && title.trim().length > 0

  function save() {
    if (!canSave) return
    onSave({ title, why, owner, window: targetWindow })
    onClose("dismiss")
  }

  return (
    <RoadmapDialogContent
      className={DIALOG_CLASS}
      showStockClose={compact}
      trapFocus={compact}
      sheetOverlay={phone}
      finalFocus={compact ? false : undefined}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          save()
        }
      }}
    >
      {/* The visible title is the editable input below; this names the dialog
          after the bet so assistive tech and tests can find it. */}
      <SheetHandle />
      <DialogTitle className="sr-only">Bet: {item.title}</DialogTitle>
      <Crumbs>
        <span className="text-caption font-medium">{COLUMN_CONFIG[item.column].label}</span>
        {item.sample && <SampleDataTag className="ml-1" />}
        {compact ? null : <CloseButton onClick={() => onClose("dismiss")} />}
      </Crumbs>
      <DialogDescription className="sr-only">
        Edit the bet&rsquo;s title, why, owner or target window, or delete it. Move it between
        columns from the card.
      </DialogDescription>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          placeholder="What's the bet?"
          aria-label="Bet title"
          className={cn(
            "text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none",
            ROADMAP_TITLE
          )}
        />
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={MAX_WHY}
          placeholder="Why it matters, in one line."
          aria-label="Why it matters"
          rows={3}
          className={cn(
            "text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none",
            ROADMAP_TEXTAREA
          )}
        />

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <OwnerPicker value={owner} onChange={setOwner} />
          <WindowField value={targetWindow} onChange={setWindow} />
        </div>

        {compact && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Column</FieldLabel>
            <ToggleGroup
              aria-label="Column"
              variant="outline"
              size="sm"
              value={[item.column]}
              onValueChange={(next) => {
                if (isColumn(next[0]) && next[0] !== item.column) {
                  onMove(next[0])
                  onClose("move")
                }
              }}
            >
              {COLUMN_ORDER.map((c) => (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  title={COLUMN_CONFIG[c].description}
                  className={cn(ROADMAP_PRESSED, ROADMAP_OPTION)}
                >
                  {COLUMN_CONFIG[c].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-caption text-muted-foreground">
              {COLUMN_CONFIG[item.column].description}
            </p>
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          Signed{" "}
          <time dateTime={item.signedAt} title={formatDate(new Date(item.signedAt))}>
            {formatRelative(Date.parse(item.signedAt), nowMs, { style: "long" })}
          </time>
          {item.fromFeatureRequest && " · from Feature Request"}
        </p>

        <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
          <Button
            variant="outline"
            size="sm"
            className={ROADMAP_TOUCH}
            disabled
            aria-label={SPAWN_TICKET_LABEL}
            title={SPAWN_TICKET_TITLE}
          >
            <TicketPlusIcon aria-hidden />
            {SPAWN_TICKET_LABEL}
          </Button>
          <p className="text-caption text-muted-foreground min-w-0 flex-1">
            <strong className="text-foreground font-medium">{ticketsLabel(item.linkedTickets)}</strong>{" "}
            linked · sample count, display only. {SPAWN_TICKET_TITLE}
          </p>
        </div>
      </div>

      <div className="border-border mt-4 flex items-center gap-3 border-t px-4 py-3 max-xl:flex-wrap max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {confirmingDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              className={cn(ROADMAP_CONFIRM_DELETE, ROADMAP_TOUCH)}
              onClick={() => {
                onDelete()
                onClose("delete")
              }}
            >
              <Trash2Icon />
              Confirm delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={ROADMAP_TOUCH}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={cn(ROADMAP_DELETE, ROADMAP_TOUCH)}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2Icon />
            Delete
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="sm" className={ROADMAP_TOUCH} onClick={() => onClose("dismiss")}>
            Cancel
          </Button>
          <Button
            size="sm"
            className={ROADMAP_TOUCH}
            onClick={save}
            disabled={!canSave}
            title={canSave ? undefined : "Nothing to save yet"}
          >
            Save
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </div>
    </RoadmapDialogContent>
  )
}
