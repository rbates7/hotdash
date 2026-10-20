"use client"

import * as React from "react"
import { AlertTriangleIcon, HardDriveIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

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
export const RESET_DESCRIPTION =
  "This discards every edit saved in this browser and regenerates the sample data from today. There is no server copy to recover from."

export const RESET_DISABLED_HINT = "Nothing is saved in this browser yet, so there is nothing to reset."

/** The confirm dialog's footer buttons: a 44px hit below 1280, like every control. */
export const CONFIRM_FOOTER_BUTTON = "max-xl:h-11! max-xl:min-w-11!"

/**
 * The red confirm reads in the text-safe danger token (4.5:1 on its tinted
 * fill in light and dark) instead of Nova's `text-destructive`, which is
 * too light on `bg-destructive/10`.
 */
export const CONFIRM_DESTRUCTIVE = "text-danger-text!"

/**
 * Screens with no sample data (My Desk, CRM) offer "Clear my entries"
 * instead of Reset: the same confirm and the same store call, worded for
 * what it does there — there is no demo data to bring back.
 */
export const CLEAR_COPY = {
  button: "Clear my entries",
  title: "Clear my entries?",
  confirm: "Clear",
  tooltip: "Discard everything you entered on this screen in this browser",
  disabledHint: "Nothing is saved in this browser yet, so there is nothing to clear.",
} as const

export const CLEAR_DESCRIPTION =
  "This deletes everything you entered on this screen in this browser. There is no server copy to recover from."

export function PersistenceNote({
  store,
  className,
  resetClassName,
  resetDescription,
  mode = "reset",
  canReset: canResetProp,
  disabledHint: disabledHintProp,
}: {
  store: PersistenceStore
  /** "clear" for screens with no sample data: Clear my entries instead of Reset. */
  mode?: "reset" | "clear"
  /**
   * Whether Reset / Clear is on. Defaults to "something is saved"; a screen
   * sharing a store with another (Bugs and Agent Workplace) narrows it to
   * its own entries.
   */
  canReset?: boolean
  /** Why it is off, when `canReset` is narrowed. */
  disabledHint?: string
  /** What Reset does, in the confirm. Defaults to the sample screens' wording. */
  resetDescription?: string
  /** Extra classes on the root span. Screens that wrap the note pass this; others stay on develop's classes. */
  className?: string
  /** Extra classes on Reset — screens use this to grow the tap target below `xl`. */
  resetClassName?: string
}) {
  const [confirming, setConfirming] = React.useState(false)
  const copy = persistenceCopy(store)
  const canReset = store.persisted && store.saved && (canResetProp ?? true)
  const hintId = React.useId()
  const clear = mode === "clear"
  const disabledHint =
    store.persisted && store.saved && disabledHintProp ? disabledHintProp : clear ? CLEAR_COPY.disabledHint : RESET_DISABLED_HINT
  const description = resetDescription ?? (clear ? CLEAR_DESCRIPTION : RESET_DESCRIPTION)

  return (
    <span
      className={cn(
        "text-micro inline-flex items-center gap-1.5",
        store.saveFailed ? "text-danger-text" : "text-muted-foreground",
        className
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
                  ? clear
                    ? CLEAR_COPY.tooltip
                    : "Discard this browser's edits and restore the demo data"
                  : disabledHint
              }
            >
              {clear ? <Trash2Icon aria-hidden /> : <RotateCcwIcon aria-hidden />}
              {clear ? CLEAR_COPY.button : "Reset"}
            </Button>
          }
        />
        {!canReset && (
          <span id={hintId} className="sr-only">
            {disabledHint}
          </span>
        )}
        <DialogContent className="sm:max-w-sm!">
          <DialogHeader>
            <DialogTitle>{clear ? CLEAR_COPY.title : "Reset demo data?"}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={CONFIRM_FOOTER_BUTTON} onClick={() => setConfirming(false)}>
              Keep my edits
            </Button>
            <Button
              variant="destructive"
              className={cn(CONFIRM_FOOTER_BUTTON, CONFIRM_DESTRUCTIVE)}
              onClick={() => {
                store.resetDemoData()
                setConfirming(false)
              }}
            >
              {clear ? CLEAR_COPY.confirm : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  )
}
