"use client"

import * as React from "react"
import { TargetIcon } from "lucide-react"

import { isIsoDay, type IsoDay } from "@/lib/clock"
import {
  ATTENDANCES,
  ATTENDANCE_LABEL,
  CLINIC_LIMITS,
  CLINIC_TYPES,
  CLINIC_TYPE_LABEL,
  COLLECTED_KEYS,
  DEFAULT_OWNER,
  isAttendance,
  isClinicType,
  type Attendance,
  type Clinic,
  type ClinicInput,
  type ClinicType,
  type CollectedKey,
} from "@/lib/clinics"
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
import { useClinics } from "@/components/clinics/clinics-store"

export const SPAWN_LABEL = "Spawn Sales Opportunity"
export const SPAWN_SOON = "Soon — creates a deal on Sales Opportunities"

/** Which field the dialog opens on; "collected" is the Record-collected path. */
export type DialogFocus = "name" | "collected"

type Draft = {
  name: string
  date: string
  host: string
  city: string
  type: ClinicType
  attendance: Attendance
  collected: Record<CollectedKey, string>
  owner: string
  notes: string
}

function draftFrom(clinic: Clinic | null, today: IsoDay): Draft {
  if (!clinic) {
    return {
      name: "",
      date: today,
      host: "",
      city: "",
      type: "clinic",
      attendance: "planned",
      collected: { leads: "", emails: "", demos: "" },
      owner: DEFAULT_OWNER,
      notes: "",
    }
  }
  return {
    name: clinic.name,
    date: clinic.date,
    host: clinic.host,
    city: clinic.city,
    type: clinic.type,
    attendance: clinic.attendance,
    collected: {
      leads: String(clinic.collected.leads),
      emails: String(clinic.collected.emails),
      demos: String(clinic.collected.demos),
    },
    owner: clinic.owner,
    notes: clinic.notes,
  }
}

function toInput(d: Draft): ClinicInput {
  const count = (s: string) => (s === "" ? 0 : Number(s))
  return {
    name: d.name,
    date: d.date,
    host: d.host,
    city: d.city,
    type: d.type,
    attendance: d.attendance,
    collected: {
      leads: count(d.collected.leads),
      emails: count(d.collected.emails),
      demos: count(d.collected.demos),
    },
    owner: d.owner,
    notes: d.notes,
  }
}

const COLLECTED_LABEL: Record<CollectedKey, string> = {
  leads: "Leads",
  emails: "Emails",
  demos: "Demos",
}

/**
 * One form for Add and Edit. Controlled by the caller so the row menu can
 * open it on a specific clinic (and on the Collected fields for "Record
 * collected"). Dates are Central calendar days; the default is the page's
 * `today`, never the machine clock.
 */
export function ClinicDialog({
  open,
  onOpenChange,
  clinic,
  focus = "name",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` adds; a clinic edits it. */
  clinic: Clinic | null
  focus?: DialogFocus
}) {
  const leadsRef = React.useRef<HTMLInputElement>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg!"
        initialFocus={focus === "collected" ? leadsRef : nameRef}
      >
        {/* The popup unmounts when closed, so the form (and its draft) is
            fresh on every open — no effect needed to reset it. */}
        <ClinicForm clinic={clinic} onDone={() => onOpenChange(false)} nameRef={nameRef} leadsRef={leadsRef} />
      </DialogContent>
    </Dialog>
  )
}

function ClinicForm({
  clinic,
  onDone,
  nameRef,
  leadsRef,
}: {
  clinic: Clinic | null
  onDone: () => void
  nameRef: React.RefObject<HTMLInputElement | null>
  leadsRef: React.RefObject<HTMLInputElement | null>
}) {
  const { today, addClinic, updateClinic } = useClinics()
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(clinic, today))
  const uid = React.useId()
  const id = (field: string) => `${uid}-${field}`

  const editing = clinic !== null
  const valid = draft.name.trim().length > 0 && isIsoDay(draft.date)

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function setCount(key: CollectedKey, raw: string) {
    // Digits only, capped at the field limit; "" is zero.
    const digits = raw.replace(/[^\d]/g, "").slice(0, String(CLINIC_LIMITS.collected).length)
    const n = digits === "" ? "" : String(Math.min(CLINIC_LIMITS.collected, Number(digits)))
    setDraft((d) => ({ ...d, collected: { ...d.collected, [key]: n } }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    const input = toInput(draft)
    if (clinic) updateClinic(clinic.id, input)
    else addClinic(input)
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={editing ? "Edit clinic" : "Add clinic"}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit clinic" : "Add clinic"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Change the details or record what we collected. "
            : "One row per clinic: when, who hosts, whether we show up. "}
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
            maxLength={CLINIC_LIMITS.name}
            placeholder="e.g. Houston Offensive Staff Clinic"
            required
          />
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
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("city")} className="text-caption font-medium">
              City
            </label>
            <Input
              id={id("city")}
              value={draft.city}
              onChange={(e) => set("city", e.target.value)}
              maxLength={CLINIC_LIMITS.city}
              placeholder={draft.type === "zoom" ? "Remote" : "e.g. Houston"}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={id("host")} className="text-caption font-medium">
            Host
          </label>
          <Input
            id={id("host")}
            value={draft.host}
            onChange={(e) => set("host", e.target.value)}
            maxLength={CLINIC_LIMITS.host}
            placeholder="Who is putting it on"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
                // Clicking the pressed item would clear it; keep one pressed.
                const next = value[0]
                if (isClinicType(next)) set("type", next)
              }}
            >
              {CLINIC_TYPES.map((t) => (
                <ToggleGroupItem
                  key={t}
                  value={t}
                  className="text-caption px-2.5 aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
                >
                  {CLINIC_TYPE_LABEL[t]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5">
            <span id={id("attend-label")} className="text-caption font-medium">
              Do we show up?
            </span>
            <ToggleGroup
              aria-labelledby={id("attend-label")}
              variant="outline"
              size="sm"
              spacing={0}
              value={[draft.attendance]}
              onValueChange={(value) => {
                const next = value[0]
                if (isAttendance(next)) set("attendance", next)
              }}
            >
              {ATTENDANCES.map((a) => (
                <ToggleGroupItem
                  key={a}
                  value={a}
                  className="text-caption px-2.5 aria-pressed:bg-primary! aria-pressed:text-primary-foreground!"
                >
                  {ATTENDANCE_LABEL[a]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="text-caption mb-1.5 font-medium">What we collected</legend>
          <div className="grid grid-cols-3 gap-3">
            {COLLECTED_KEYS.map((key) => (
              <div key={key} className="grid gap-1.5">
                <label htmlFor={id(key)} className="text-micro text-muted-foreground font-medium">
                  {COLLECTED_LABEL[key]}
                </label>
                <Input
                  id={id(key)}
                  ref={key === "leads" ? leadsRef : undefined}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={CLINIC_LIMITS.collected}
                  step={1}
                  value={draft.collected[key]}
                  onChange={(e) => setCount(key, e.target.value)}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={id("owner")} className="text-caption font-medium">
              Owner
            </label>
            <Input
              id={id("owner")}
              value={draft.owner}
              onChange={(e) => set("owner", e.target.value)}
              maxLength={CLINIC_LIMITS.owner}
              placeholder={DEFAULT_OWNER}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("notes")} className="text-caption font-medium">
              Notes
            </label>
            <Textarea
              id={id("notes")}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={CLINIC_LIMITS.notes}
              rows={2}
              className="min-h-9"
              placeholder="Anything the next person needs to know"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        {/* Reqs: a clinic that closes can spawn a Sales Opportunity.
            That page is not built, so the button is here, disabled, and
            says when it will work. The hint is also in the accessible
            description, since a disabled control cannot be hovered by
            keyboard. */}
        <span className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={SPAWN_SOON}
            aria-describedby={id("spawn-hint")}
          >
            <TargetIcon aria-hidden />
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
            {editing ? "Save changes" : "Add clinic"}
          </Button>
        </span>
      </DialogFooter>
    </form>
  )
}
