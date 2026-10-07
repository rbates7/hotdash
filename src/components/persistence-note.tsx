"use client"

import * as React from "react"
import { AlertTriangleIcon, HardDriveIcon, RotateCcwIcon } from "lucide-react"

import type { PersistenceStore } from "@/lib/persistence"
import { cn } from "@/lib/utils"
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

/** What the note says in each state. Exported so tests and screens agree. */
export const PERSISTENCE_COPY = {
  loading: "Loading saved edits…",
  unsaved: "Edits save in this browser",
  saved: "Saved in this browser",
  failed: "Couldn't save in this browser",
} as const

/**
 * The note's accessible name, constant across states, so tests can find it
 * by role and name (`status` normally, `alert` after a failed save) rather
 * than by test id.
 */
export const PERSISTENCE_NOTE_NAME = "Where edits live"

export function persistenceCopy(store: Pick<PersistenceStore, "persisted" | "saved" | "saveFailed">) {
  if (!store.persisted) return PERSISTENCE_COPY.loading
  if (store.saveFailed) return PERSISTENCE_COPY.failed
  if (store.saved) return PERSISTENCE_COPY.saved
  return PERSISTENCE_COPY.unsaved
}

/**
 * The one persistence note for the dashboard. Says exactly where edits
 * live (this browser only, until a real datastore lands), whether the last
 * save worked, and offers Reset — enabled only once something is saved,
 * behind a confirm, because it throws the founder's edits away.
 *
 * Pass any store that exposes `PersistenceStore` (Agent Workplace / Home
 * via `useIssues()`, Metrics via `useMetrics()`).
 */
export const RESET_DISABLED_HINT = "Nothing is saved in this browser yet, so there is nothing to reset."

export function PersistenceNote({
  store,
  resetClassName,
}: {
  store: PersistenceStore
  /** Extra classes on Reset — screens use this to grow the tap target below `xl`. */
  resetClassName?: string
}) {
  const [confirming, setConfirming] = React.useState(false)
  const copy = persistenceCopy(store)
  const canReset = store.persisted && store.saved
  const hintId = React.useId()

  return (
    <span
      className={cn(
        "text-micro inline-flex items-center gap-1.5",
        store.saveFailed ? "text-danger-text" : "text-muted-foreground"
      )}
    >
      {store.saveFailed ? (
        <AlertTriangleIcon className="size-3.5" aria-hidden />
      ) : (
        <HardDriveIcon className="size-3.5" aria-hidden />
      )}
      <span
        data-testid="persistence-note"
        role={store.saveFailed ? "alert" : "status"}
        aria-label={PERSISTENCE_NOTE_NAME}
      >
        {copy}
      </span>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        {/* Disabled Reset stays in the tab order (focusableWhenDisabled) and
            describes why it is off, so keyboard and screen-reader users get
            the same hint a pointer user gets from the title. */}
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              // `!` beats Nova's unlayered `.cn-button-variant-ghost` hover and
              // `.cn-button-size-xs` (text-xs, px-2), as app-sidebar does.
              className={cn(
                "text-micro! text-muted-foreground h-6 px-1.5! aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent! aria-disabled:hover:text-muted-foreground!",
                resetClassName
              )}
              disabled={!canReset}
              focusableWhenDisabled
              aria-describedby={canReset ? undefined : hintId}
              title={
                canReset
                  ? "Discard this browser's edits and restore the demo data"
                  : RESET_DISABLED_HINT
              }
            >
              <RotateCcwIcon aria-hidden />
              Reset
            </Button>
          }
        />
        {!canReset && (
          <span id={hintId} className="sr-only">
            {RESET_DISABLED_HINT}
          </span>
        )}
        <DialogContent className="sm:max-w-sm!">
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>
              This discards every edit saved in this browser and regenerates the
              sample data from today. There is no server copy to recover from.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep my edits
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                store.resetDemoData()
                setConfirming(false)
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  )
}
