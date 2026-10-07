"use client"

import { PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { NewBetDialog } from "@/components/product-roadmap/item-dialog"
import { PersistenceNote } from "@/components/product-roadmap/persistence-note"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { SAMPLE_DATA_LABEL, SAMPLE_PALETTE } from "@/components/product-roadmap/sample-data"

/**
 * Right side of the page header: where edits live (and Reset), the dashed
 * "Sample data" badge the sibling boards wear (gone once no sample bet
 * remains), and the one way to add a bet.
 */
export function HeaderActions() {
  const { items, persisted } = useRoadmap()
  const hasSample = persisted && items.some((i) => i.sample)

  return (
    <div className="flex items-center gap-2.5">
      <PersistenceNote />
      {hasSample && (
        <span
          data-testid="sample-data-badge"
          className={cn(
            "rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase",
            SAMPLE_PALETTE
          )}
        >
          {SAMPLE_DATA_LABEL}
        </span>
      )}
      <NewBetDialog
        trigger={
          <Button size="sm">
            <PlusIcon />
            New bet
          </Button>
        }
      />
    </div>
  )
}
