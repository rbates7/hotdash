import { Suspense } from "react"

import { now } from "@/lib/clock"
import { CasesScreen } from "@/components/crm/cases-screen"
import { CrmApp } from "@/components/crm/crm-app"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export default function CrmCasesPage() {
  return (
    <CrmApp nowMs={now().getTime()}>
      <Suspense fallback={<CrmTableSkeleton label="Loading saved cases" />}>
        <CasesScreen />
      </Suspense>
    </CrmApp>
  )
}
