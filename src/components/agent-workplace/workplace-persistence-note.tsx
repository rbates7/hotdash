"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { WORKPLACE_RESET } from "@/components/agent-workplace/responsive"
import { useIssues } from "@/components/agent-workplace/issues-store"

/** The shared note, bound to the Workplace store (pages are server components). */
export function WorkplacePersistenceNote() {
  return <PersistenceNote store={useIssues()} resetClassName={WORKPLACE_RESET} />
}
