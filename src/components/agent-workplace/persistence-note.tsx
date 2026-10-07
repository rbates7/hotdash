"use client"

import { HardDriveIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useIssues } from "@/components/agent-workplace/issues-store"

/**
 * Says exactly where edits live: this browser only, until a real datastore
 * lands. Also the one way to get the seed data back.
 */
export function PersistenceNote() {
  const { persisted, resetDemoData } = useIssues()

  return (
    <span className="text-micro text-muted-foreground inline-flex items-center gap-1.5">
      <HardDriveIcon className="size-3.5" aria-hidden />
      <span data-testid="persistence-note">
        {persisted ? "Saved in this browser" : "Loading saved edits…"}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="text-micro text-muted-foreground h-6 px-1.5"
        onClick={resetDemoData}
        title="Discard this browser's edits and restore the demo data"
      >
        <RotateCcwIcon aria-hidden />
        Reset
      </Button>
    </span>
  )
}
