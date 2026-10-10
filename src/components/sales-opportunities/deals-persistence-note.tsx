"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useDeals } from "@/components/sales-opportunities/deals-store"

/**
 * Reset as a 44px hit below 1280, like every control on the screen; `!` beats
 * Nova's unlayered `size-xs`. Desktop keeps the shared note's own classes.
 */
export const DEALS_RESET = "max-xl:h-11! max-xl:min-w-11!"

/**
 * The shared note, bound to the deals store (pages are server components),
 * with Sales' Reset sizing passed through the shared `resetClassName` prop.
 */
export function DealsPersistenceNote() {
  return <PersistenceNote store={useDeals()} resetClassName={DEALS_RESET} />
}
