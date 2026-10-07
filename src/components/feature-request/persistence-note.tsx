"use client"

import * as React from "react"
import { HardDriveIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"

export const NOTE_LOADING = "Loading saved ideas…"
export const NOTE_UNSAVED = "Edits save in this browser"
export const NOTE_SAVED = "Saved in this browser"
export const NOTE_FAILED = "Couldn't save in this browser"

/**
 * Says exactly where edits live: this browser only, until a real datastore
 * lands. The wording tracks the truth — the seed alone is never written, so
 * until the first edit there is nothing saved; and a write that fails
 * (quota, private mode) says so rather than pretending.
 *
 * Reset is the one way to get the sample cards back. It is only offered
 * when there is a saved copy to throw away, and asks before it does.
 *
 * Feature-local on purpose: Metrics (#11) is consolidating a shared note;
 * this one is shaped to be swapped for it.
 */
export function PersistenceNote() {
  const { persisted, saved, saveFailed, resetDemoData } = useFeatureRequests()
  const [confirming, setConfirming] = React.useState(false)

  const text = !persisted
    ? NOTE_LOADING
    : saveFailed
      ? NOTE_FAILED
      : saved
        ? NOTE_SAVED
        : NOTE_UNSAVED

  return (
    <span
      className={cn(
        "text-micro inline-flex items-center gap-1.5",
        saveFailed ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {saveFailed ? (
        <TriangleAlertIcon className="size-3.5" aria-hidden />
      ) : (
        <HardDriveIcon className="size-3.5" aria-hidden />
      )}
      <span data-testid="persistence-note" role={saveFailed ? "alert" : undefined}>
        {text}
      </span>

      {confirming ? (
        <>
          <Button
            variant="destructive"
            size="xs"
            className="text-micro h-6 px-1.5"
            onClick={() => {
              resetDemoData()
              setConfirming(false)
            }}
          >
            <RotateCcwIcon aria-hidden />
            Confirm reset
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-micro text-muted-foreground h-6 px-1.5"
            onClick={() => setConfirming(false)}
          >
            Keep edits
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className="text-micro text-muted-foreground h-6 px-1.5"
          onClick={() => setConfirming(true)}
          disabled={!saved}
          title={
            saved
              ? "Discard this browser's ideas and edits and restore the sample cards"
              : "Nothing is saved in this browser yet"
          }
        >
          <RotateCcwIcon aria-hidden />
          Reset
        </Button>
      )}
    </span>
  )
}
