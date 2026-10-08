"use client"

import * as React from "react"
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { isIsoDay, type IsoDay } from "@/lib/clock"
import {
  CAPS,
  OWNERS,
  STAGES,
  STAGE_CONFIG,
  clampText,
  isOwner,
  isStage,
  type Deal,
  type DealInput,
  type Owner,
  type Stage,
} from "@/lib/sales-opportunities"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { normalizeInput, useDeals } from "@/components/sales-opportunities/deals-store"

/* ------------------------------------------------------------- touch */

/*
 * Below 1280 these dialogs open from the phone sheet and the tablet row menu,
 * so every control is a 44px hit there. Nova's `.cn-*` classes are unlayered,
 * hence the `!`. Desktop (≥1280) keeps Nova's sizes untouched.
 */
/** Inputs, the date field and select triggers. */
const FIELD = "max-xl:h-11!"
/** Footer Cancel / Save / Delete. */
const FOOTER_BUTTON = "max-xl:h-11!"
/**
 * Nova's destructive button text is 3.7:1 on its own tint; below 1280 (where
 * this confirm now opens from the phone sheet) it uses the text-safe danger
 * token. Desktop keeps develop's look.
 */
const DESTRUCTIVE_TEXT = "max-xl:text-danger-text!"
/** Select options. */
const OPTION = "max-xl:min-h-11"
/**
 * The popup: the stock × grows to 44×44, and on a phone a tall form scrolls
 * inside the screen instead of running off it.
 */
const DIALOG = "max-xl:[&>[data-slot=dialog-close]]:size-11! max-md:max-h-[calc(100dvh-2rem)] max-md:overflow-y-auto"
/** Keeps the title and description clear of the 44px ×. */
const HEADER = "max-xl:pr-10"
/** Two fields side by side on tablet and desktop, stacked on a phone. */
const PAIR = "max-md:grid-cols-1"

/* ----------------------------------------------------------------- form */

type Draft = {
  who: string
  org: string
  what: string
  /** Digits only; "" means no value yet. */
  value: string
  stage: Stage
  nextStep: string
  /** YYYY-MM-DD or "" for no date. */
  nextStepDue: string
  owner: Owner
}

const EMPTY_DRAFT: Draft = {
  who: "",
  org: "",
  what: "",
  value: "",
  stage: "talking",
  nextStep: "",
  nextStepDue: "",
  owner: "Trip",
}

function draftFrom(deal: Deal): Draft {
  return {
    who: deal.who,
    org: deal.org,
    what: deal.what,
    value: deal.value === null ? "" : String(deal.value),
    stage: deal.stage,
    nextStep: deal.nextStep,
    nextStepDue: deal.nextStepDue ?? "",
    owner: deal.owner,
  }
}

/** The draft as the store takes it, or null while a required field is missing. */
export function inputFrom(draft: Draft): DealInput | null {
  const who = clampText(draft.who, CAPS.who)
  const org = clampText(draft.org, CAPS.org)
  const what = clampText(draft.what, CAPS.what)
  const nextStep = clampText(draft.nextStep, CAPS.nextStep)
  if (!who || !org || !what || !nextStep) return null
  if (draft.value !== "" && !/^\d+$/.test(draft.value)) return null
  if (draft.nextStepDue !== "" && !isIsoDay(draft.nextStepDue)) return null
  return normalizeInput({
    who,
    org,
    what,
    value: draft.value === "" ? null : Number(draft.value),
    stage: draft.stage,
    nextStep,
    nextStepDue: draft.nextStepDue === "" ? null : draft.nextStepDue,
    owner: draft.owner,
  })
}

const INPUT_KEYS = ["who", "org", "what", "value", "stage", "nextStep", "nextStepDue", "owner"] as const

function unchanged(deal: Deal, input: DealInput) {
  return INPUT_KEYS.every((k) => deal[k] === input[k])
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-caption flex items-baseline justify-between gap-2 font-medium">
        {label}
        {hint && <span className="text-muted-foreground font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function StageSelect({ value, onChange }: { value: Stage; onChange: (s: Stage) => void }) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (isStage(v)) onChange(v)
      }}
      items={STAGES.map((s) => ({ value: s, label: STAGE_CONFIG[s].label }))}
    >
      <SelectTrigger aria-label="Stage" className={`w-full ${FIELD}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGES.map((s) => (
          <SelectItem key={s} value={s} className={OPTION}>
            {STAGE_CONFIG[s].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function OwnerSelect({ value, onChange }: { value: Owner; onChange: (o: Owner) => void }) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (isOwner(v)) onChange(v)
      }}
      items={OWNERS.map((o) => ({ value: o, label: o }))}
    >
      <SelectTrigger aria-label="Owner" className={`w-full ${FIELD}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OWNERS.map((o) => (
          <SelectItem key={o} value={o} className={OPTION}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function DealFields({
  draft,
  onChange,
  autoFocus,
}: {
  draft: Draft
  onChange: (next: Draft) => void
  autoFocus?: boolean
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value })
  return (
    <div className="grid gap-3">
      <div className={`grid grid-cols-2 gap-3 ${PAIR}`}>
        <Field label="Who" hint={`${draft.who.length}/${CAPS.who}`}>
          <Input
            className={FIELD}
            autoFocus={autoFocus}
            value={draft.who}
            onChange={(e) => set("who", e.target.value)}
            maxLength={CAPS.who}
            placeholder="Coach Jordan Reyes"
            aria-label="Who"
            required
          />
        </Field>
        <Field label="School / org" hint={`${draft.org.length}/${CAPS.org}`}>
          <Input
            className={FIELD}
            value={draft.org}
            onChange={(e) => set("org", e.target.value)}
            maxLength={CAPS.org}
            placeholder="Westlake HS"
            aria-label="School / org"
            required
          />
        </Field>
      </div>
      <div className={`grid grid-cols-[1fr_140px] gap-3 ${PAIR}`}>
        <Field label="What they're buying" hint={`${draft.what.length}/${CAPS.what}`}>
          <Input
            className={FIELD}
            value={draft.what}
            onChange={(e) => set("what", e.target.value)}
            maxLength={CAPS.what}
            placeholder="Staff seats × 8"
            aria-label="What they're buying"
            required
          />
        </Field>
        <Field label="Value (USD)" hint="optional">
          <Input
            className={FIELD}
            type="text"
            inputMode="numeric"
            value={draft.value}
            onChange={(e) =>
              set("value", e.target.value.replace(/[^\d]/g, "").slice(0, CAPS.valueDigits))
            }
            maxLength={CAPS.valueDigits}
            placeholder="—"
            aria-label="Value"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <StageSelect value={draft.stage} onChange={(s) => set("stage", s)} />
        </Field>
        <Field label="Owner">
          <OwnerSelect value={draft.owner} onChange={(o) => set("owner", o)} />
        </Field>
      </div>
      <div className={`grid grid-cols-[1fr_160px] gap-3 ${PAIR}`}>
        <Field label="Next step" hint={`${draft.nextStep.length}/${CAPS.nextStep}`}>
          <Input
            className={FIELD}
            value={draft.nextStep}
            onChange={(e) => set("nextStep", e.target.value)}
            maxLength={CAPS.nextStep}
            placeholder="Send the quote"
            aria-label="Next step"
            required
          />
        </Field>
        <Field label="Due" hint="optional · Central">
          <Input
            className={FIELD}
            type="date"
            value={draft.nextStepDue}
            onChange={(e) => set("nextStepDue", e.target.value)}
            maxLength={10}
            aria-label="Due date"
          />
        </Field>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- control */

/**
 * Every dialog opens from its own trigger by default. The phone sheet and the
 * tablet row menu open the same dialogs from elsewhere: pass `open` and
 * `onOpenChange` to control it, and `trigger={null}` to render no trigger
 * (or an element to render as the trigger instead).
 */
export type DialogControl = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement | null
  /** Where focus lands on close, when the opener may be gone (a deleted deal's card). */
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}

function useDialogOpen({ open, onOpenChange }: DialogControl) {
  const [own, setOwn] = React.useState(false)
  const controlled = open !== undefined
  const setOpen = (next: boolean) => {
    if (!controlled) setOwn(next)
    onOpenChange?.(next)
  }
  return [controlled ? open : own, setOpen] as const
}

/* ------------------------------------------------------------ add / edit */

export function AddDealDialog({ trigger, finalFocus, ...control }: DialogControl = {}) {
  const { addDeal } = useDeals()
  const [open, setOpen] = useDialogOpen(control)
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT)
  const input = inputFrom(draft)

  function close() {
    setOpen(false)
    setDraft(EMPTY_DRAFT)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!input) return
    addDeal(input)
    close()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else close()
      }}
    >
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm" className="h-9 px-3.5 max-xl:h-11! max-xl:px-4!">
                <PlusIcon aria-hidden />
                Add deal
              </Button>
            )
          }
        />
      )}
      <DialogContent className={`sm:max-w-lg! ${DIALOG}`} finalFocus={finalFocus}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader className={HEADER}>
            <DialogTitle>Add deal</DialogTitle>
            <DialogDescription>
              Someone is actually talking. Who, what they&apos;re buying, the next step and
              who owns it. Saved in this browser only.
            </DialogDescription>
          </DialogHeader>
          <DealFields draft={draft} onChange={setDraft} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" className={FOOTER_BUTTON} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className={FOOTER_BUTTON} disabled={!input}>
              Add deal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditDealDialog({ deal, trigger, finalFocus, ...control }: { deal: Deal } & DialogControl) {
  const { editDeal } = useDeals()
  const [open, setOpen] = useDialogOpen(control)
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(deal))
  // Start every edit from the row as it is now, not a stale draft — however
  // it was opened (its own trigger, the phone sheet or the tablet row menu).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(draftFrom(deal))
  }
  const input = inputFrom(draft)
  const canSave = input !== null && !unchanged(deal, input)

  function close() {
    setOpen(false)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!input || !canSave) return
    editDeal(deal.id, input)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Edit ${deal.who}`}
                title="Edit this deal"
                className="text-muted-foreground"
              >
                <PencilIcon aria-hidden />
              </Button>
            )
          }
        />
      )}
      <DialogContent className={`sm:max-w-lg! ${DIALOG}`} finalFocus={finalFocus}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader className={HEADER}>
            <DialogTitle>Edit deal</DialogTitle>
            <DialogDescription>
              {deal.who} · {deal.org}. Saving counts as a touch. Saved in this browser only.
            </DialogDescription>
          </DialogHeader>
          <DealFields draft={draft} onChange={setDraft} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" className={FOOTER_BUTTON} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className={FOOTER_BUTTON} disabled={!canSave}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------- next step done */

export function NextStepDoneDialog({ deal, trigger, finalFocus, ...control }: { deal: Deal } & DialogControl) {
  const { completeNextStep } = useDeals()
  const [open, setOpen] = useDialogOpen(control)
  const [nextStep, setNextStep] = React.useState("")
  const [due, setDue] = React.useState("")
  const trimmed = clampText(nextStep, CAPS.nextStep)
  const valid = trimmed.length > 0 && (due === "" || isIsoDay(due))

  function close() {
    setOpen(false)
    setNextStep("")
    setDue("")
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    completeNextStep(deal.id, trimmed, due === "" ? null : (due as IsoDay))
    close()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else close()
      }}
    >
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Mark next step done for ${deal.who}`}
                title="Next step done — set the next one"
                className="text-muted-foreground"
              >
                <CheckIcon aria-hidden />
              </Button>
            )
          }
        />
      )}
      <DialogContent className={`sm:max-w-md! ${DIALOG}`} finalFocus={finalFocus}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader className={HEADER}>
            <DialogTitle>Next step done</DialogTitle>
            <DialogDescription>
              &ldquo;{deal.nextStep}&rdquo; is done for {deal.who}. Every live deal keeps a
              next step — what is it now?
            </DialogDescription>
          </DialogHeader>
          <div className={`grid grid-cols-[1fr_160px] gap-3 ${PAIR}`}>
            <Field label="New next step" hint={`${nextStep.length}/${CAPS.nextStep}`}>
              <Input
                className={FIELD}
                autoFocus
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                maxLength={CAPS.nextStep}
                placeholder="Schedule the install"
                aria-label="New next step"
                required
              />
            </Field>
            <Field label="Due" hint="optional · Central">
              <Input
                className={FIELD}
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                maxLength={10}
                aria-label="Due date"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className={FOOTER_BUTTON} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className={FOOTER_BUTTON} disabled={!valid}>
              Save next step
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- delete */

export function DeleteDealDialog({ deal, trigger, finalFocus, ...control }: { deal: Deal } & DialogControl) {
  const { deleteDeal } = useDeals()
  const [open, setOpen] = useDialogOpen(control)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${deal.who}`}
                title="Delete this deal"
                className="text-muted-foreground"
              >
                <Trash2Icon aria-hidden />
              </Button>
            )
          }
        />
      )}
      <DialogContent className={`sm:max-w-sm! ${DIALOG}`} finalFocus={finalFocus}>
        <DialogHeader className={HEADER}>
          <DialogTitle>Delete this deal?</DialogTitle>
          <DialogDescription>
            {deal.who} · {deal.org} · {deal.what}. This browser holds the only copy; there is
            no undo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className={FOOTER_BUTTON} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className={`${FOOTER_BUTTON} ${DESTRUCTIVE_TEXT}`}
            onClick={() => {
              deleteDeal(deal.id)
              setOpen(false)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
