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

/**
 * The one New bet control. The page renders it beside the title on phone
 * and again in Page actions from `md` up (Deke 13:2202 / 13:2650).
 */
export const NEW_BET_READ_ONLY_TITLE = "Read-only: the roadmap comes from Notion. Add bets there."
export const NEW_BET_CONNECTING_TITLE = "Connecting to Notion\u2026"

export function NewBetButton({ className }: { className?: string }) {
  const { readOnly, source } = useRoadmap()
  return (
    <NewBetDialog
      trigger={
        <Button
          size="sm"
          className={cn(ROADMAP_TOUCH, className)}
          disabled={readOnly}
          title={
            source === "notion" ? NEW_BET_READ_ONLY_TITLE : source === "connecting" ? NEW_BET_CONNECTING_TITLE : undefined
          }
        >
          <PlusIcon />
          New bet
        </Button>
      }
    />
  )
}

/**
 * Right side of the page header: where edits live (and Reset) and the one
 * way to add a bet (hidden on phone; the title row carries it there). No
 * Sample data badge: the Roadmap never shows sample bets.
 */
export function HeaderActions({
  className,
  newBetClassName,
}: {
  className?: string
  newBetClassName?: string
}) {
  return (
    <div
      role="group"
      aria-label="Page actions"
      className={cn(ROADMAP_HEADER_ACTIONS, className)}
    >
      <RoadmapPersistenceNote />
      <NewBetButton className={newBetClassName} />
    </div>
  )
}
