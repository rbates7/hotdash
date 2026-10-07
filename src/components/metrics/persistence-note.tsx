"use client"

import { HardDriveIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useMetrics } from "@/components/metrics/metrics-store"

/**
 * Says exactly where edits live: this browser only, until Stripe/Supabase
 * wiring lands. Also the one way to get the seed data back. Same shape as
 * the Agent Workplace note so the two pages read alike.
 */
export function PersistenceNote() {
  const { persisted, resetDemoData } = useMetrics()

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
