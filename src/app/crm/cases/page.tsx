import { Suspense } from "react"

import { CasesScreen } from "@/components/crm/cases-screen"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export default function CrmCasesPage() {
  return (
    <Suspense fallback={<CrmTableSkeleton label="Loading saved cases" />}>
      <CasesScreen />
    </Suspense>
  )
}
