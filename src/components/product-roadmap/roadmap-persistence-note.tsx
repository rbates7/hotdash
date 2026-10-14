"use client"

import { AlertTriangleIcon, BookOpenIcon } from "lucide-react"

import { formatWallClock } from "@/lib/clock"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import { cn } from "@/lib/utils"
import { PersistenceNote } from "@/components/persistence-note"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { ROADMAP_RESET } from "@/components/product-roadmap/responsive"
import { useSettings } from "@/hooks/use-settings"

/** The note's accessible name while the board comes from Notion. */
export const NOTION_SOURCE_NOTE_NAME = "Where the roadmap comes from"
export const NOTION_SOURCE_COPY = "Read-only · from Notion"

/**
 * The shared note, bound to the Roadmap store (pages are server
 * components). While Notion is the source it says so instead — read-only,
 * or "Last updated <time>" when Notion could not be read just now — and
 * offers no Reset: there is nothing of this browser's on screen to reset.
 */
export function RoadmapPersistenceNote() {
  const store = useRoadmap()
  const { timeZone } = useSettings()
  const { live } = store
  if (!live) return <PersistenceNote store={store} resetClassName={ROADMAP_RESET} />
  return (
    <span
      className="text-micro text-muted-foreground inline-flex min-h-6 items-center gap-1.5"
      title={live.stale ? undefined : `Last synced ${formatWallClock(live.lastSyncedAt, timeZone)}`}
    >
      {live.stale ? (
        <AlertTriangleIcon className="text-danger-text size-3.5" aria-hidden />
      ) : (
        <BookOpenIcon className="size-3.5" aria-hidden />
      )}
      <span
        data-testid="notion-source-note"
        data-stale={live.stale || undefined}
        role="status"
        aria-label={NOTION_SOURCE_NOTE_NAME}
        className={cn(live.stale && "text-foreground")}
      >
        {live.stale ? lastUpdatedLabel(live.lastSyncedAt, timeZone) : NOTION_SOURCE_COPY}
      </span>
    </span>
  )
}
