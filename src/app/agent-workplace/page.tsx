import { Suspense } from "react"

import { now } from "@/lib/clock"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import {
  WORKPLACE_DUMMY,
  WORKPLACE_HEADER,
  WORKPLACE_HEADER_META,
} from "@/components/agent-workplace/responsive"
import { WorkplacePersistenceNote } from "@/components/agent-workplace/workplace-persistence-note"
import { WorkplaceTabs } from "@/components/agent-workplace/workplace-tabs"

export const metadata = {
  title: "Agent Workplace · Chlk",
}

// Rendered per request, never at build, so now() is the request's instant.
export const dynamic = "force-dynamic"

export default function AgentWorkplacePage() {
  return (
    <IssuesProvider nowMs={now().getTime()}>
      <div className="flex min-w-0 w-full flex-col gap-2.5 overflow-x-hidden">
        <header className={WORKPLACE_HEADER}>
          <h1 className="text-display-sm font-semibold tracking-tight">
            Agent Workplace
          </h1>
          <div className={WORKPLACE_HEADER_META}>
            <WorkplacePersistenceNote />
            <span className={WORKPLACE_DUMMY}>Dummy / design mock</span>
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
