"use client"

import * as React from "react"
import { PresentationIcon } from "lucide-react"

import { isIsoDay, type IsoDay } from "@/lib/clock"
import {
  DEFAULT_OWNER,
  INITIATIVE_LIMITS,
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_LABEL,
  INITIATIVE_TYPES,
  INITIATIVE_TYPE_LABEL,
  isInitiativeStatus,
  isInitiativeType,
  type Initiative,
  type InitiativeInput,
  type InitiativeStatus,
  type InitiativeType,
} from "@/lib/community-development"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useCommunityDevelopment } from "@/components/community-development/community-development-store"
import {
  CD_DIALOG,
  CD_HEADER,
  CD_INPUT,
  CD_OWNER_IMPACT,
  CD_PAIR,
  CD_PRESSED,
  CD_SHEET,
  CD_TEXTAREA,
  CD_TOGGLE_GROUP,
  CD_TOUCH,
} from "@/components/community-development/responsive"

export const SPAWN_LABEL = "Could spawn a Clinic"
export const SPAWN_SOON = "Soon — an outreach or volunteer day could become a Clinic row"

type Draft = {
  name: string
  type: InitiativeType
  partner: string
  date: string
  cadence: string
  status: InitiativeStatus
  owner: string
  impact: string
}

function draftFrom(row: Initiative | null, today: IsoDay): Draft {
  if (!row) {
    return {
      name: "",
      type: "volunteer",
      partner: "",
      date: today,
      cadence: "",
      status: "planned",
      owner: DEFAULT_OWNER,
      impact: "",
    }
  }
  return {
    name: row.name,
    type: row.type,
    partner: row.partner,
    date: row.date ?? "",
    cadence: row.cadence,
    status: row.status,
    owner: row.owner,
    impact: row.impact,
  }
}

function toInput(d: Draft): InitiativeInput {
  return {
    name: d.name,
    type: d.type,
    partner: d.partner,
    date: d.date && isIsoDay(d.date) ? d.date : null,
    cadence: d.cadence,
    status: d.status,
    owner: d.owner,
    impact: d.impact,
  }
}

/**
 * Base UI wraps Tab at the sheet's ends through a focus guard and a
 * requestAnimationFrame, so for a frame focus sits outside the sheet. Own
 * the whole Tab cycle synchronously (Sales #29 wrap, plus mid-list steps
 * from Feature Request #30) so Playwright never samples the guard.
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

export function useSheetTabWrap(active: boolean) {
  React.useLayoutEffect(() => {
    if (!active) return
    const rootOf = () => document.querySelector<HTMLElement>('[data-slot="sheet-content"]')
    const onKey = (event: KeyboardEvent) => {
      const root =
        (event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-slot="sheet-content"]')
          : null) ?? rootOf()
      if (root) wrapTabAt(root, event)
    }
    const onFocusIn = (event: FocusEvent) => {
      const root = rootOf()
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
  }, [active])
}

export type OverlayFocus = React.ComponentProps<typeof DialogContent>["finalFocus"]

/**
 * Phone (<768) opens the existing form as a bottom sheet (Deke 7:47).
 * Tablet and desktop keep the centered dialog. ≥1280 chrome is unchanged.
 */
export function InitiativeOverlay({
  open,
  onOpenChange,
  dialogClassName,
  initialFocus,
  finalFocus,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dialogClassName?: string
  initialFocus?: React.RefObject<HTMLElement | null>
  finalFocus?: OverlayFocus
  children: React.ReactNode
}) {
  const phone = useIsMobile()
  useSheetTabWrap(open && phone)
  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={CD_SHEET}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(CD_DIALOG, dialogClassName)}
        initialFocus={initialFocus}
        finalFocus={finalFocus}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

/**
 * One form for Add and Edit. Dates are Central calendar days; the default
 * is the page's `today`, never the machine clock. A row needs a name and
 * either a date or a cadence.
 */
export function InitiativeDialog({
  open,
  onOpenChange,
  initiative,
  onDelete,
  onView,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` adds; an initiative edits it. */
  initiative: Initiative | null
  /** Phone sheet only — opens the existing DeleteDialog. */
  onDelete?: (initiative: Initiative) => void
  /** Phone sheet only — opens the existing View sheet. */
  onView?: (initiative: Initiative) => void
  finalFocus?: OverlayFocus
}) {
  const nameRef = React.useRef<HTMLInputElement>(null)
  return (
    <InitiativeOverlay
      open={open}
      onOpenChange={onOpenChange}
      dialogClassName="sm:max-w-lg!"
      initialFocus={nameRef}
      finalFocus={finalFocus}
    >
      <InitiativeForm
        initiative={initiative}
        onDone={() => onOpenChange(false)}
        onDelete={initiative && onDelete ? () => onDelete(initiative) : undefined}
        onView={initiative && onView ? () => onView(initiative) : undefined}
        nameRef={nameRef}
      />
    </InitiativeOverlay>
  )
}

function InitiativeForm({
  initiative,
  onDone,
  onDelete,
  onView,
  nameRef,
}: {
  initiative: Initiative | null
  onDone: () => void
  onDelete?: () => void
  onView?: () => void
  nameRef: React.RefObject<HTMLInputElement | null>
}) {
  const { today, addInitiative, updateInitiative } = useCommunityDevelopment()
  const phone = useIsMobile()
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(initiative, today))
  const uid = React.useId()
  const id = (field: string) => `${uid}-${field}`

  const editing = initiative !== null
  const hasWhen = isIsoDay(draft.date) || draft.cadence.trim().length > 0
  const valid = draft.name.trim().length > 0 && hasWhen

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    const input = toInput(draft)
    if (initiative) updateInitiative(initiative.id, input)
    else addInitiative(input)
    onDone()
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-label={editing ? "Edit initiative" : "Add initiative"}
    >
      <DialogHeader className={CD_HEADER}>
        <DialogTitle>{editing ? "Edit initiative" : "Add initiative"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Change the details, status, or what we gave. "
            : "One row per giving or foundation initiative. "}
          Dates are calendar days in Central time. Saved in this browser only.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={id("name")} className="text-caption font-medium">
            Name
          </label>
          <Input
            id={id("name")}
            ref={nameRef}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={INITIATIVE_LIMITS.name}
            placeholder="e.g. Youth flag-football clinic volunteer day"
            required
            className={CD_INPUT}
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={id("partner")} className="text-caption font-medium">
            Beneficiary / partner
          </label>
          <Input
            id={id("partner")}
            value={draft.partner}
            onChange={(e) => set("partner", e.target.value)}
            maxLength={INITIATIVE_LIMITS.partner}
            placeholder="School, league, or nonprofit"
            className={CD_INPUT}
          />
        </div>

        <div className="grid gap-1.5">
          <span id={id("type-label")} className="text-caption font-medium">
            Type
          </span>
          <ToggleGroup
            aria-labelledby={id("type-label")}
            variant="outline"
            size="sm"
            spacing={0}
            value={[draft.type]}
            onValueChange={(value) => {
              const next = value[0]
              if (isInitiativeType(next)) set("type", next)
            }}
            className={CD_TOGGLE_GROUP}
          >
            {INITIATIVE_TYPES.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                className={cn(
                  "text-caption px-2.5",
                  CD_PRESSED,
                  CD_TOUCH
                )}
              >
                {INITIATIVE_TYPE_LABEL[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid gap-1.5">
          <span id={id("status-label")} className="text-caption font-medium">
            Status
          </span>
          <ToggleGroup
            aria-labelledby={id("status-label")}
            variant="outline"
            size="sm"
            spacing={0}
            value={[draft.status]}
            onValueChange={(value) => {
              const next = value[0]
              if (isInitiativeStatus(next)) set("status", next)
            }}
            className={CD_TOGGLE_GROUP}
          >
            {INITIATIVE_STATUSES.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className={cn(
                  "text-caption px-2.5",
                  CD_PRESSED,
                  CD_TOUCH
                )}
              >
                {INITIATIVE_STATUS_LABEL[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className={cn("grid grid-cols-2 gap-3", CD_PAIR)} data-testid="when-fields">
          <div className="grid gap-1.5">
            <label htmlFor={id("date")} className="text-caption font-medium">
              Date
            </label>
            <Input
              id={id("date")}
              type="date"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
              className={CD_INPUT}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("cadence")} className="text-caption font-medium">
              Cadence
            </label>
            <Input
              id={id("cadence")}
              value={draft.cadence}
              onChange={(e) => set("cadence", e.target.value)}
              maxLength={INITIATIVE_LIMITS.cadence}
              placeholder="e.g. Annual, each spring"
              className={CD_INPUT}
            />
          </div>
        </div>
        <p className="text-caption text-muted-foreground -mt-1">
          A date, a cadence, or both. Dates are Central calendar days.
        </p>

        <div
          className={cn("grid grid-cols-[1fr_2fr] gap-3", CD_PAIR, CD_OWNER_IMPACT)}
          data-testid="owner-impact-fields"
        >
          <div className="grid gap-1.5">
            <label htmlFor={id("owner")} className="text-caption font-medium">
              Owner
            </label>
            <Input
              id={id("owner")}
              value={draft.owner}
              onChange={(e) => set("owner", e.target.value)}
              maxLength={INITIATIVE_LIMITS.owner}
              placeholder={DEFAULT_OWNER}
              className={CD_INPUT}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("impact")} className="text-caption font-medium">
              What we gave / impact
            </label>
            <Textarea
              id={id("impact")}
              value={draft.impact}
              onChange={(e) => set("impact", e.target.value)}
              maxLength={INITIATIVE_LIMITS.impact}
              rows={2}
              className={cn("min-h-9", CD_TEXTAREA)}
              placeholder="e.g. 12 iPads, 40 kids coached"
            />
          </div>
        </div>
      </div>

      {editing && phone && (onView || onDelete) ? (
        <div className="flex flex-col gap-2">
          {onView ? (
            <Button
              type="button"
              variant="outline"
              className={CD_TOUCH}
              onClick={() => {
                onDone()
                onView()
              }}
            >
              View
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              className={cn(CD_TOUCH, "text-danger-text!")}
              onClick={() => {
                onDone()
                onDelete()
              }}
            >
              Delete initiative
            </Button>
          ) : null}
        </div>
      ) : null}

      <DialogFooter className="sm:justify-between">
        <span className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={SPAWN_SOON}
            aria-describedby={id("spawn-hint")}
            className={CD_TOUCH}
          >
            <PresentationIcon aria-hidden />
            {SPAWN_LABEL}
          </Button>
          <span id={id("spawn-hint")} className="sr-only">
            {SPAWN_SOON}
          </span>
        </span>
        <span className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} className={CD_TOUCH}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid} className={CD_TOUCH}>
            {editing ? "Save changes" : "Add initiative"}
          </Button>
        </span>
      </DialogFooter>
    </form>
  )
}
