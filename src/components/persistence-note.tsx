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
export function PersistenceNote({ store }: { store: PersistenceStore }) {
  const [confirming, setConfirming] = React.useState(false)
  const copy = persistenceCopy(store)
  const canReset = store.persisted && store.saved

  return (
    <span
      className={cn(
        "text-micro inline-flex items-center gap-1.5",
        store.saveFailed ? "text-destructive" : "text-muted-foreground"
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
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="text-micro text-muted-foreground h-6 px-1.5"
              disabled={!canReset}
              title={
                canReset
                  ? "Discard this browser's edits and restore the demo data"
                  : "Nothing is saved in this browser yet"
              }
            >
              <RotateCcwIcon aria-hidden />
              Reset
            </Button>
          }
        />
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
