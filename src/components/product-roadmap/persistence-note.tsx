"use client"

import * as React from "react"
import { HardDriveIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"

export const SAVE_FAILED_TEXT = "Couldn't save in this browser"

/**
 * Says exactly where edits live: this browser only, until a real datastore
 * lands. The wording tracks the truth: the seed alone is never written, so
 * until the first edit there is nothing saved to speak of; and if a write
 * fails (quota, private mode) it says so instead of pretending.
 *
 * Reset is the one way to get the sample bets back. It is only enabled when
 * there is something saved to throw away, and asks first.
 */
export function PersistenceNote() {
  const { persisted, saved, saveFailed, resetDemoData } = useRoadmap()
  const [confirming, setConfirming] = React.useState(false)

  const text = !persisted
    ? "Loading saved bets…"
    : saveFailed
      ? SAVE_FAILED_TEXT
      : saved
        ? "Saved in this browser"
        : "Edits save in this browser"

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
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="text-micro text-muted-foreground h-6 px-1.5"
              disabled={!persisted || !saved}
              title={
                saved
                  ? "Discard this browser's bets and edits and restore the sample bets"
                  : "Nothing saved in this browser yet"
              }
            />
          }
        >
          <RotateCcwIcon aria-hidden />
          Reset
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="bg-surface w-full sm:max-w-sm! rounded-xl border p-0! gap-0! shadow-lg"
        >
          <div className="flex flex-col gap-1.5 px-4 pt-4">
            <DialogTitle className="text-title-sm font-semibold tracking-tight">
              Reset the roadmap?
            </DialogTitle>
            <DialogDescription className="text-body text-muted-foreground">
              This throws away every bet and edit saved in this browser and brings the
              eight sample bets back. There is no undo.
            </DialogDescription>
          </div>
          <div className="border-border mt-4 flex items-center justify-end gap-3 border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep my edits
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                resetDemoData()
                setConfirming(false)
              }}
            >
              <RotateCcwIcon aria-hidden />
              Confirm reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  )
}
