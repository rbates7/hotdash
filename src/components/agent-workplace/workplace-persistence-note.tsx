"use client"

import { PersistenceNote } from "@/components/persistence-note"
import { useIssues } from "@/components/agent-workplace/issues-store"

/** The shared note, bound to the Workplace store (pages are server components). */
export function WorkplacePersistenceNote({
  className,
  resetClassName,
}: {
  className?: string
  resetClassName?: string
}) {
  return (
    <PersistenceNote
      store={useIssues()}
      className={className}
      resetClassName={resetClassName}
    />
  )
}
