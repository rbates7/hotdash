"use client"

import { PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { NewBetDialog } from "@/components/product-roadmap/item-dialog"
import { RoadmapPersistenceNote } from "@/components/product-roadmap/roadmap-persistence-note"
import {
  ROADMAP_HEADER_ACTIONS,
  ROADMAP_TOUCH,
} from "@/components/product-roadmap/responsive"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { SAMPLE_DATA_LABEL, SAMPLE_SURFACE } from "@/components/sample-data"

/**
 * The one New bet control. The page renders it beside the title on phone
 * and again in Page actions from `md` up (Deke 13:2202 / 13:2650).
 */
export function NewBetButton({ className }: { className?: string }) {
  return (
    <NewBetDialog
      trigger={
        <Button size="sm" className={cn(ROADMAP_TOUCH, className)}>
          <PlusIcon />
          New bet
        </Button>
      }
    />
  )
}

/**
 * Right side of the page header: where edits live (and Reset), the dashed
 * "Sample data" badge the sibling boards wear (gone once no sample bet
 * remains), and the one way to add a bet (hidden on phone; the title row
 * carries it there).
 */
export function HeaderActions({
  className,
  newBetClassName,
}: {
  className?: string
  newBetClassName?: string
}) {
  const { items, persisted } = useRoadmap()
  const hasSample = persisted && items.some((i) => i.sample)

  return (
    <div
      role="group"
      aria-label="Page actions"
      className={cn(ROADMAP_HEADER_ACTIONS, className)}
    >
      <RoadmapPersistenceNote />
      {hasSample && (
        <span
          data-testid="sample-data-badge"
          className={cn(
            "rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase",
            SAMPLE_SURFACE
          )}
        >
          {SAMPLE_DATA_LABEL}
        </span>
      )}
      <NewBetButton className={newBetClassName} />
    </div>
  )
}
