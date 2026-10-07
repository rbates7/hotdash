"use client"

import * as React from "react"
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
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { ticketsLabel } from "@/components/product-roadmap/roadmap-card"
import { SampleDataTag } from "@/components/sample-data"

export const SPAWN_TICKET_LABEL = "Spawn ticket (soon)"
export const SPAWN_TICKET_TITLE =
  "Will create an Agent Workplace ticket linked to this bet. Not wired yet — tickets still start on the Issues board."

const DIALOG_CLASS =
  // Nova's .cn-dialog-content pins sm:max-w-sm, so the override has to be
  // scoped to the same breakpoint and marked important to win.
  "bg-surface w-full sm:max-w-xl! overflow-hidden rounded-xl border p-0! gap-0! shadow-lg"

const INPUT =
  "border-border text-body bg-background rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"

const PRESSED = "aria-pressed:bg-brand/12! aria-pressed:text-brand! aria-pressed:border-brand/40!"

function Crumbs({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-4">
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
          <ToggleGroupItem key={owner} value={owner} className={PRESSED}>
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
        className={cn(INPUT, "w-44")}
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

/* ---------------------------------------------------------------- new bet */

export function NewBetDialog({ trigger }: { trigger: React.ReactElement }) {
  const { addItem } = useRoadmap()
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
      <DialogContent
        showCloseButton={false}
        className={DIALOG_CLASS}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            submit()
          }
        }}
      >
        <Crumbs>
          <DialogTitle className="text-caption font-medium">New bet</DialogTitle>
          <CloseButton onClick={() => setOpen(false)} />
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
            className="text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none"
          />
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            maxLength={MAX_WHY}
            placeholder="Why it matters, in one line."
            aria-label="Why it matters"
            rows={3}
            className="text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none"
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
                  className={PRESSED}
                >
                  {COLUMN_CONFIG[c].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-caption text-muted-foreground">{COLUMN_CONFIG[column].description}</p>
          </div>
        </div>

        <div className="border-border mt-4 flex items-center justify-end gap-3 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!title.trim()}>
            Add bet
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </DialogContent>
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
  onClose: () => void
}) {
  const { patchItem, removeItem } = useRoadmap()

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
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
}: {
  item: RoadmapItem
  onClose: () => void
  onSave: (patch: { title: string; why: string; owner: RoadmapOwner; window: string }) => void
  onDelete: () => void
}) {
  const { nowMs } = useRoadmap()
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
    onClose()
  }

  return (
    <DialogContent
      showCloseButton={false}
      className={DIALOG_CLASS}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          save()
        }
      }}
    >
      {/* The visible title is the editable input below; this names the dialog
          after the bet so assistive tech and tests can find it. */}
      <DialogTitle className="sr-only">Bet: {item.title}</DialogTitle>
      <Crumbs>
        <span className="text-caption font-medium">{COLUMN_CONFIG[item.column].label}</span>
        {item.sample && <SampleDataTag className="ml-1" />}
        <CloseButton onClick={onClose} />
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
          className="text-title-lg placeholder:text-muted-foreground bg-transparent font-semibold outline-none"
        />
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={MAX_WHY}
          placeholder="Why it matters, in one line."
          aria-label="Why it matters"
          rows={3}
          className="text-body placeholder:text-muted-foreground resize-none bg-transparent outline-none"
        />

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <OwnerPicker value={owner} onChange={setOwner} />
          <WindowField value={targetWindow} onChange={setWindow} />
        </div>

        <p className="text-caption text-muted-foreground">
          Signed{" "}
          <time dateTime={item.signedAt} title={formatDate(new Date(item.signedAt))}>
            {formatRelative(Date.parse(item.signedAt), nowMs)}
          </time>
          {item.fromFeatureRequest && " · from Feature Request"}
        </p>

        <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
          <Button
            variant="outline"
            size="sm"
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

      <div className="border-border mt-4 flex items-center gap-3 border-t px-4 py-3">
        {confirmingDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2Icon />
              Confirm delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2Icon />
            Delete
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!canSave}
            title={canSave ? undefined : "Nothing to save yet"}
          >
            Save
            <kbd className="text-micro bg-background/20 ml-1 rounded px-1">⌘↵</kbd>
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}
