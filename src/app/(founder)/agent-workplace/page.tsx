import { Suspense } from "react"

import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { WorkplaceTabs } from "@/components/agent-workplace/workplace-tabs"

export const metadata = {
  title: "Agent Workplace · Chlk",
}

export default function AgentWorkplacePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-lg font-semibold">Agent Workplace</h1>
      {/* WorkplaceTabs reads the tab and open ticket from the URL, so it needs
          a Suspense boundary around useSearchParams. */}
      <Suspense fallback={null}>
        <IssuesProvider>
          <WorkplaceTabs />
        </IssuesProvider>
      </Suspense>
    </div>
  )
}
