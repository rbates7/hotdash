"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ChevronRightIcon, MapIcon, Trash2Icon, XIcon } from "lucide-react"

import { formatDate, formatRelative } from "@/lib/clock"
import {
  DEFAULT_FROM,
  LIMITS,
  STATUS_CONFIG,
  STATUS_ORDER,
  isFeatureStatus,
  type FeatureRequest,
  type FeatureStatus,
} from "@/lib/feature-requests/feature-requests"
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
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"
import {
  FR_CONFIRM_DELETE,
  FR_ICON,
  FR_INPUT,
  FR_PRESSED,
  FR_SHEET,
  FR_SHEET_HANDLE,
  FR_STATUS,
  FR_TEXTAREA,
  FR_TITLE,
  FR_TOUCH,
} from "@/components/feature-request/responsive"
import { SampleDataTag } from "@/components/sample-data"

export type IdeaCloseReason = "dismiss" | "delete" | "move"

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

function FrDialogContent({
  className,
  children,
  onKeyDown,
}: {
  className?: string
  children: React.ReactNode
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = ref.current
      if (root) wrapTabAt(root, event)
    }
    const onFocusIn = (event: FocusEvent) => {
      const root = ref.current
      const next = event.target
      if (!root || !(next instanceof Node) || root.contains(next)) return
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
  }, [])

  return (
    <DialogPortal>
      <DialogOverlay data-slot="sheet-overlay" />
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          "cn-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className
        )}
        onKeyDown={onKeyDown}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

export const MOVE_TO_ROADMAP = "Move to On Roadmap"
export const ROADMAP_HANDOFF_NOTE =
  "Moves the card to the On Roadmap column on this board. The Product Roadmap page isn't wired yet, so nothing is sent anywhere."

const DIALOG_CLASS =
  // Nova's .cn-dialog-content pins sm:max-w-sm, so the override has to be
  // scoped to the same breakpoint and marked important to win. On phone the
  // same dialog docks as a bottom sheet (no Feature Request sheet frame).
  `bg-surface w-full sm:max-w-xl! overflow-hidden rounded-xl border p-0! gap-0! shadow-lg ${FR_SHEET}`

function SheetHandle() {
  return <div aria-hidden className={FR_SHEET_HANDLE} />
}

function Crumbs({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-4 max-md:pt-2">
      <span className="text-caption text-muted-foreground">Feature Request</span>
      <ChevronRightIcon className="text-faint-foreground size-3.5" aria-hidden />
      {children}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-micro text-muted-foreground font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

const INPUT = cn(
  "border-border text-body bg-background rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  FR_INPUT
)

/* --------------------------------------------------------------- new idea */

export function NewIdeaDialog({ trigger }: { trigger: React.ReactElement }) {
  const { addRequest } = useFeatureRequests()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [ask, setAsk] = React.useState("")
  const [from, setFrom] = React.useState(DEFAULT_FROM)

  function reset() {
    setTitle("")
    setAsk("")
    setFrom(DEFAULT_FROM)
  }

  function submit() {
    if (!title.trim()) return
    addRequest({ title, ask, from })
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
      <FrDialogContent
        className={DIALOG_CLASS}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            submit()
          }
        }}
      >
        <SheetHandle />
        <Crumbs>
          <DialogTitle className="text-caption font-medium">New idea</DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className={cn("ml-auto", FR_TOUCH, FR_ICON)}
            onClick={() => setOpen(false)}
          >
            <XIcon />
          </Button>
        </Crumbs>
        <DialogDescription className="sr-only">
          Capture one of Dan&rsquo;s raw ideas. It lands in the Inbox column.
        </DialogDescription>

        <div className="flex flex-col gap-3 px-4 pt-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the idea?"
            aria-label="Idea title"
            maxLength={LIMITS.title}
            className={cn(
              "text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none",
              FR_TITLE
            )}
          />
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="The ask, in one line. What would it let a coach do?"
            aria-label="The ask"
            maxLength={LIMITS.ask}
            rows={4}
            className={cn(
              "text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none",
              FR_TEXTAREA
            )}
          />
          <div className="flex items-end gap-3">
            <Field label="From">
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From"
                maxLength={LIMITS.from}
                className={cn(INPUT, "w-32")}
              />
            </Field>
            <p className="text-caption text-muted-foreground pb-1.5">
              New ideas land in <strong className="text-foreground font-medium">Inbox</strong>;
              move them from the card.
            </p>
          </div>
        </div>

        <div className="border-border mt-4 flex items-center justify-end gap-3 border-t px-4 py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" size="sm" className={FR_TOUCH} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className={FR_TOUCH} onClick={submit} disabled={!title.trim()}>
            Add idea
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </FrDialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------- edit idea */

export function EditIdeaDialog({
  request,
  onClose,
}: {
  /** The card being viewed; `null` closes the dialog. */
  request: FeatureRequest | null
  onClose: (reason?: IdeaCloseReason) => void
}) {
  const { now, patchRequest, setStatus, removeRequest } = useFeatureRequests()

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(next) => {
        if (!next) onClose("dismiss")
      }}
    >
      {request && (
        <EditIdeaBody
          // Remount per card so draft state never leaks between ideas.
          key={request.id}
          request={request}
          now={now}
          onClose={onClose}
          onSave={(patch, status) => {
            patchRequest(request.id, patch)
            if (status !== request.status) setStatus(request.id, status)
          }}
          onDelete={() => removeRequest(request.id)}
        />
      )}
    </Dialog>
  )
}

function EditIdeaBody({
  request,
  now,
  onClose,
  onSave,
  onDelete,
}: {
  request: FeatureRequest
  /** The request instant from the store; "Added Sat, Aug 22" (`formatRelative` long) is measured from it. */
  now: Date
  onClose: (reason?: IdeaCloseReason) => void
  onSave: (
    patch: { title: string; ask: string; from: string },
    status: FeatureStatus
  ) => void
  onDelete: () => void
}) {
  const [title, setTitle] = React.useState(request.title)
  const [ask, setAsk] = React.useState(request.ask)
  const [from, setFrom] = React.useState(request.from)
  const [status, setDraftStatus] = React.useState<FeatureStatus>(request.status)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const dirty =
    title.trim() !== request.title ||
    ask.trim() !== request.ask ||
    from.trim() !== request.from ||
    status !== request.status
  const canSave = dirty && title.trim().length > 0

  function save(nextStatus: FeatureStatus = status) {
    if (!title.trim()) return
    onSave({ title, ask, from }, nextStatus)
    onClose(nextStatus !== request.status ? "move" : "dismiss")
  }

  return (
    <FrDialogContent
      className={DIALOG_CLASS}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          if (canSave) save()
        }
      }}
    >
      {/* The visible title is the editable input below; this names the dialog
          after the card so assistive tech and tests can find it. */}
      <SheetHandle />
      <DialogTitle className="sr-only">Idea: {request.title}</DialogTitle>
      <Crumbs>
        <span className="text-caption font-medium">
          {STATUS_CONFIG[request.status].label}
        </span>
        {request.sample && <SampleDataTag className="ml-1" />}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className={cn("ml-auto", FR_TOUCH, FR_ICON)}
          onClick={() => onClose("dismiss")}
        >
          <XIcon />
        </Button>
      </Crumbs>
      <DialogDescription className="sr-only">
        Edit the idea, move it between columns, or delete it.
      </DialogDescription>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's the idea?"
          aria-label="Idea title"
          maxLength={LIMITS.title}
          className={cn(
            "text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none",
            FR_TITLE
          )}
        />
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="The ask, in one line."
            aria-label="The ask"
            maxLength={LIMITS.ask}
            rows={3}
            className={cn(
              "text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none",
              FR_TEXTAREA
            )}
          />

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <Field label="From">
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From"
              maxLength={LIMITS.from}
              className={cn(INPUT, "w-32")}
            />
          </Field>
          <p className="text-caption text-muted-foreground pb-1.5">
            Added{" "}
            <time dateTime={request.createdAt} title={formatDate(new Date(request.createdAt))}>
              {formatRelative(Date.parse(request.createdAt), now.getTime(), { style: "long" })}
            </time>
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-micro text-muted-foreground font-medium tracking-wide uppercase">
            Status
          </span>
          <ToggleGroup
            aria-label="Status"
            variant="outline"
            size="sm"
            value={[status]}
            onValueChange={(value) => {
              // Single-select: ignore the empty array from re-clicking the
              // pressed item so a status is always chosen.
              const next = value[0]
              if (isFeatureStatus(next)) setDraftStatus(next)
            }}
            className="flex-wrap"
          >
            {STATUS_ORDER.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                title={STATUS_CONFIG[s].description}
                className={cn(FR_PRESSED, FR_STATUS)}
              >
                {STATUS_CONFIG[s].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-caption text-muted-foreground">
            {STATUS_CONFIG[status].description}
          </p>
        </div>

        <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
          {request.status === "roadmap" ? (
            <p className="text-caption text-muted-foreground">
              <strong className="text-foreground font-medium">On Roadmap here only.</strong>{" "}
              The Product Roadmap page isn&rsquo;t wired yet, so nothing has been sent anywhere.
            </p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className={FR_TOUCH}
                onClick={() => save("roadmap")}
                disabled={!title.trim()}
              >
                <MapIcon className="text-brand" />
                {MOVE_TO_ROADMAP}
              </Button>
              <p className="text-caption text-muted-foreground min-w-0 flex-1">
                {ROADMAP_HANDOFF_NOTE}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="border-border mt-4 flex items-center gap-3 border-t px-4 py-3 max-xl:flex-wrap max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {confirmingDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              className={cn(FR_CONFIRM_DELETE, FR_TOUCH)}
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
              className={FR_TOUCH}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={cn("text-danger-text hover:text-danger-text", FR_TOUCH)}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2Icon />
            Delete
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="sm" className={FR_TOUCH} onClick={() => onClose("dismiss")}>
            Cancel
          </Button>
          <Button
            size="sm"
            className={FR_TOUCH}
            onClick={() => save()}
            disabled={!canSave}
            title={canSave ? undefined : "Nothing to save yet"}
          >
            Save
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </div>
    </FrDialogContent>
  )
}
