"use client"

import * as React from "react"

import {
  distinctSenders,
  type BulkOutcome,
  type BulkTriageThread,
  type TriageBulkAction,
} from "@/lib/crm/triage/bulk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CRM_44, CRM_DANGER_TEXT, CRM_DIALOG, CRM_DIALOG_HEADER } from "@/components/crm/crm-touch"

export type TriageBulkRunner = (
  action: TriageBulkAction,
  threads: BulkTriageThread[]
) => Promise<BulkOutcome[]>

type TriageBulkContext = {
  busy: boolean
  isSelected: (id: string) => boolean
  toggle: (id: string, selected: boolean) => void
  selectSender: (email: string) => void
}

const Context = React.createContext<TriageBulkContext | null>(null)

/** The selection, inside a `TriageBulk`; null outside one (per-card controls then hide). */
export function useTriageBulk() {
  return React.useContext(Context)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const sameSender = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function doneMessage(action: TriageBulkAction, done: BulkTriageThread[]) {
  if (action === "ignore") return `Ignored ${plural(done.length, "thread")}.`
  if (action === "promote") return `Promoted ${plural(done.length, "thread")} to ${done.length === 1 ? "a case" : "cases"}.`
  return `Always ignoring ${plural(distinctSenders(done).length, "sender")}.`
}

/** Native checkbox in a label that grows to a 44×44 hit below 1280 (like CRM_ICON_44). */
const CHECK_HIT = "flex shrink-0 cursor-pointer items-center justify-center max-xl:size-11"
const CHECK_BOX = "accent-primary size-4 cursor-pointer disabled:cursor-not-allowed"

/**
 * Select Triage cards and act on them together: Select all (tri-state),
 * Clear selection, and a bar that sticks while anything is selected with
 * Promote to case, Ignore and Always ignore these senders. Each card is
 * processed on its own (`run` settles every one); failed cards stay
 * selected and the status line says how many. Ids that leave `threads`
 * leave the selection.
 */
export function TriageBulk({
  threads,
  run,
  onComplete,
  children,
}: {
  threads: BulkTriageThread[]
  run: TriageBulkRunner
  onComplete?: (outcomes: BulkOutcome[]) => void
  children: React.ReactNode
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState<{ text: string; failed: boolean } | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false)
  const selectAllRef = React.useRef<HTMLInputElement>(null)

  // Prune ids no longer listed (resolved here, elsewhere, or by a refresh).
  const idsKey = threads.map((t) => t.id).join("\n")
  const [prunedFor, setPrunedFor] = React.useState(idsKey)
  if (prunedFor !== idsKey) {
    setPrunedFor(idsKey)
    const live = new Set(threads.map((t) => t.id))
    setSelected((prev) => {
      const kept = [...prev].filter((id) => live.has(id))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }

  const chosen = threads.filter((t) => selected.has(t.id))
  const count = chosen.length
  const all = count > 0 && count === threads.length
  const partial = count > 0 && !all
  const senders = distinctSenders(chosen)

  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partial
  }, [partial])

  const context = React.useMemo<TriageBulkContext>(
    () => ({
      busy,
      isSelected: (id) => selected.has(id),
      toggle: (id, on) =>
        setSelected((prev) => {
          const next = new Set(prev)
          if (on) next.add(id)
          else next.delete(id)
          return next
        }),
      selectSender: (email) =>
        setSelected((prev) => {
          const next = new Set(prev)
          for (const t of threads) if (sameSender(t.senderEmail, email)) next.add(t.id)
          return next
        }),
    }),
    [busy, selected, threads]
  )

  function clear() {
    setSelected(new Set())
    selectAllRef.current?.focus()
  }

  async function perform(action: TriageBulkAction) {
    const targets = chosen
    if (targets.length === 0) return
    setBusy(true)
    setStatus(null)
    let outcomes: BulkOutcome[]
    try {
      outcomes = await run(action, targets)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Failed."
      outcomes = targets.map((t) => ({ id: t.id, ok: false, error: reason }))
    }
    const failedIds = new Set(outcomes.filter((o) => !o.ok).map((o) => o.id))
    const done = targets.filter((t) => !failedIds.has(t.id))
    setSelected(failedIds)
    setBusy(false)
    if (failedIds.size === 0) {
      setStatus({ text: doneMessage(action, done), failed: false })
      selectAllRef.current?.focus()
    } else {
      const firstError = outcomes.find((o) => !o.ok)
      const reason = firstError && !firstError.ok ? ` ${firstError.error}` : ""
      setStatus({
        text: `${done.length > 0 ? `${doneMessage(action, done)} ` : ""}${plural(failedIds.size, "thread")} failed and ${failedIds.size === 1 ? "stays" : "stay"} selected.${reason}`,
        failed: true,
      })
    }
    onComplete?.(outcomes)
  }

  if (threads.length === 0) {
    return (
      <>
        {status ? (
          <p role="status" className="text-muted-foreground text-sm">
            {status.text}
          </p>
        ) : null}
        {children}
      </>
    )
  }

  return (
    <Context.Provider value={context}>
      <section
        aria-label="Bulk triage"
        aria-busy={busy || undefined}
        data-slot="triage-bulk-bar"
        data-selected={count > 0 ? "true" : "false"}
        className={cn(
          "bg-background flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-1.5",
          // Below md the app header (h-14) is sticky too; the bar sits under it.
          count > 0 && "sticky top-16 z-10 shadow-sm md:top-2"
        )}
      >
        <label className={cn("flex cursor-pointer items-center gap-2 text-sm font-medium", "max-xl:min-h-11")}>
          <span className={cn(CHECK_HIT, "max-xl:-ml-3.5 max-xl:-mr-3.5")}>
            <input
              ref={selectAllRef}
              type="checkbox"
              className={CHECK_BOX}
              checked={all}
              disabled={busy}
              onChange={() => setSelected(all ? new Set() : new Set(threads.map((t) => t.id)))}
            />
          </span>
          Select all
        </label>
        <span role="status" aria-live="polite" className="text-muted-foreground text-sm tabular-nums">
          {count > 0 ? `${count} selected` : ""}
        </span>
        {count > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
            <Button size="sm" className={CRM_44} disabled={busy} onClick={() => perform("promote")}>
              Promote to case
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={CRM_44}
              disabled={busy}
              onClick={() => perform("ignore")}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className={cn(CRM_44, CRM_DANGER_TEXT)}
              disabled={busy}
              onClick={() => setIsConfirmOpen(true)}
            >
              Always ignore these senders
            </Button>
            <Button size="sm" variant="ghost" className={CRM_44} disabled={busy} onClick={clear}>
              Clear selection
            </Button>
          </div>
        ) : null}
      </section>
      <p
        role="status"
        data-slot="triage-bulk-status"
        data-failed={status?.failed ? "true" : undefined}
        className={cn("text-sm empty:sr-only", status?.failed ? "text-danger-text" : "text-muted-foreground")}
      >
        {status?.text ?? ""}
      </p>

      {children}

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className={cn("sm:max-w-sm!", CRM_DIALOG)}>
          <DialogHeader className={CRM_DIALOG_HEADER}>
            <DialogTitle>Always ignore {plural(senders.length, "sender")}?</DialogTitle>
            <DialogDescription>
              Every pending thread from {senders.length === 1 ? "this sender" : "these senders"} leaves
              Triage, and their new mail skips it from now on.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-sm" aria-label="Senders to ignore">
            {senders.map((email) => (
              <li key={email} className="truncate">
                {email}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" className={CRM_44} onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className={cn(CRM_44, CRM_DANGER_TEXT)}
              onClick={() => {
                setIsConfirmOpen(false)
                void perform("ignore-sender")
              }}
            >
              Always ignore {plural(senders.length, "sender")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  )
}

/** A card's own checkbox; renders nothing outside a `TriageBulk`. */
export function TriageSelectCheckbox({ thread }: { thread: BulkTriageThread }) {
  const bulk = useTriageBulk()
  if (!bulk) return null
  const sender = thread.senderName ?? thread.senderEmail
  return (
    <label className={cn(CHECK_HIT, "max-xl:-my-2 max-xl:-ml-3.5 max-xl:-mr-1.5")}>
      <input
        type="checkbox"
        className={CHECK_BOX}
        aria-label={`Select thread from ${sender}: ${thread.subject || "(no subject)"}`}
        checked={bulk.isSelected(thread.id)}
        disabled={bulk.busy}
        onChange={(event) => bulk.toggle(thread.id, event.target.checked)}
      />
    </label>
  )
}
