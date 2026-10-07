"use client"

import { HardDriveIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useFeatureRequests } from "@/components/feature-request/feature-requests-store"

/**
 * Says exactly where edits live: this browser only, until a real datastore
 * lands. Also the one way to get the sample cards back. Same shape as the
 * Agent Workplace note so the pages read alike. The wording tracks the
 * truth: the seed alone is never written, so until the first edit there is
 * nothing saved to speak of.
 */
export function PersistenceNote() {
  const { persisted, saved, resetDemoData } = useFeatureRequests()

  return (
    <span className="text-micro text-muted-foreground inline-flex items-center gap-1.5">
      <HardDriveIcon className="size-3.5" aria-hidden />
      <span data-testid="persistence-note">
        {!persisted
          ? "Loading saved ideas…"
          : saved
            ? "Saved in this browser"
            : "Edits save in this browser"}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="text-micro text-muted-foreground h-6 px-1.5"
        onClick={resetDemoData}
        title="Discard this browser's ideas and edits and restore the sample cards"
      >
        <RotateCcwIcon aria-hidden />
        Reset
      </Button>
    </span>
  )
}
