import { Suspense } from "react"

import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { PersistenceNote } from "@/components/agent-workplace/persistence-note"
import { WorkplaceTabs } from "@/components/agent-workplace/workplace-tabs"

export const metadata = {
  title: "Agent Workplace · Chlk",
}

export default function AgentWorkplacePage() {
  return (
    <IssuesProvider>
      <div className="flex min-w-0 flex-col gap-2.5">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-4">
          <h1 className="text-display-sm font-semibold tracking-tight">
            Agent Workplace
          </h1>
          <div className="flex items-center gap-2.5">
            <PersistenceNote />
            <span className="text-muted-foreground border-surface-border bg-surface rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase">
              Dummy / design mock
            </span>
          </div>
        </header>
        {/* WorkplaceTabs reads the tab and open ticket from the URL, so it
            needs a Suspense boundary around useSearchParams. */}
        <Suspense fallback={null}>
          <WorkplaceTabs />
        </Suspense>
      </div>
    </IssuesProvider>
  )
}
