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
import { useCommunityDevelopment } from "@/components/community-development/community-development-store"

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
 * One form for Add and Edit. Dates are Central calendar days; the default
 * is the page's `today`, never the machine clock. A row needs a name and
 * either a date or a cadence.
 */
export function InitiativeDialog({
  open,
  onOpenChange,
  initiative,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` adds; an initiative edits it. */
  initiative: Initiative | null
}) {
  const nameRef = React.useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg!" initialFocus={nameRef}>
        <InitiativeForm
          initiative={initiative}
          onDone={() => onOpenChange(false)}
          nameRef={nameRef}
        />
      </DialogContent>
    </Dialog>
  )
}

function InitiativeForm({
  initiative,
  onDone,
  nameRef,
}: {
  initiative: Initiative | null
  onDone: () => void
  nameRef: React.RefObject<HTMLInputElement | null>
}) {
  const { today, addInitiative, updateInitiative } = useCommunityDevelopment()
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
      <DialogHeader>
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
          >
            {INITIATIVE_TYPES.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                className="text-caption px-2.5 aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
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
          >
            {INITIATIVE_STATUSES.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="text-caption px-2.5 aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
              >
                {INITIATIVE_STATUS_LABEL[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={id("date")} className="text-caption font-medium">
              Date
            </label>
            <Input
              id={id("date")}
              type="date"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
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
            />
          </div>
        </div>
        <p className="text-caption text-muted-foreground -mt-1">
          A date, a cadence, or both. Dates are Central calendar days.
        </p>

        <div className="grid grid-cols-[1fr_2fr] gap-3">
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
              className="min-h-9"
              placeholder="e.g. 12 iPads, 40 kids coached"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <span className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={SPAWN_SOON}
            aria-describedby={id("spawn-hint")}
          >
            <PresentationIcon aria-hidden />
            {SPAWN_LABEL}
          </Button>
          <span id={id("spawn-hint")} className="sr-only">
            {SPAWN_SOON}
          </span>
        </span>
        <span className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            {editing ? "Save changes" : "Add initiative"}
          </Button>
        </span>
      </DialogFooter>
    </form>
  )
}
