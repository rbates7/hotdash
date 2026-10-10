"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useMetrics } from "@/components/metrics/metrics-store"
import { METRICS_RESET } from "@/components/metrics/responsive"

/** The shared note, bound to the Metrics store (pages are server components). */
export function MetricsPersistenceNote() {
  return <PersistenceNote store={useMetrics()} resetClassName={METRICS_RESET} />
}
