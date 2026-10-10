"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"
import { ROADMAP_RESET } from "@/components/product-roadmap/responsive"

/** The shared note, bound to the Roadmap store (pages are server components). */
export function RoadmapPersistenceNote() {
  return <PersistenceNote store={useRoadmap()} resetClassName={ROADMAP_RESET} />
}
