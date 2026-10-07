"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useRoadmap } from "@/components/product-roadmap/roadmap-store"

/** The shared note, bound to the Roadmap store (pages are server components). */
export function RoadmapPersistenceNote() {
  return <PersistenceNote store={useRoadmap()} />
}
