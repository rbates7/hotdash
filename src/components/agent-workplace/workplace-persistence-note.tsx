"use client"

import * as React from "react"

import { PersistenceNote } from "@/components/persistence-note"
import { hasEntries, useIssues, type ClearScope } from "@/components/agent-workplace/issues-store"

/** What each screen's Clear my entries deletes, in its confirm. */
export const CLEAR_SCOPE_DESCRIPTION: Record<ClearScope, string> = {
  workplace:
    "This deletes the tickets and sprints you entered on Agent Workplace in this browser. Bug tickets stay on Bugs. There is no server copy to recover from.",
  bugs: "This deletes the bug tickets you entered in this browser. Other Agent Workplace tickets stay. There is no server copy to recover from.",
}

/** Why Clear is off when the board is saved but this screen has nothing of its own. */
export const CLEAR_SCOPE_EMPTY_HINT: Record<ClearScope, string> = {
  workplace: "You have no Agent Workplace tickets or sprints saved here, so there is nothing to clear.",
  bugs: "You have no bug tickets saved here, so there is nothing to clear.",
}

/**
 * The shared note, bound to the Workplace store (pages are server
 * components), in Clear my entries mode: the board has no sample rows to
 * reset to. Bugs and Agent Workplace share the store, so each page's Clear
 * deletes only its own tickets (`scope`), and is off when there are none.
 */
export function WorkplacePersistenceNote({
  scope,
  className,
  resetClassName,
}: {
  scope: ClearScope
  className?: string
  resetClassName?: string
}) {
  const issues = useIssues()
  const store = React.useMemo(() => ({ ...issues, resetDemoData: () => issues.clearEntries(scope) }), [issues, scope])
  return (
    <PersistenceNote
      mode="clear"
      store={store}
      canReset={hasEntries(issues, scope)}
      disabledHint={CLEAR_SCOPE_EMPTY_HINT[scope]}
      resetDescription={CLEAR_SCOPE_DESCRIPTION[scope]}
      className={className}
      resetClassName={resetClassName}
    />
  )
}
