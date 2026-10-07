"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useDeals } from "@/components/sales-opportunities/deals-store"

/** The shared note, bound to the deals store (pages are server components). */
export function DealsPersistenceNote() {
  return <PersistenceNote store={useDeals()} />
}
