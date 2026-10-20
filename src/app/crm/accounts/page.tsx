import { Suspense } from "react"

import { now } from "@/lib/clock"
import { AccountsScreen } from "@/components/crm/accounts-screen"
import { CrmApp } from "@/components/crm/crm-app"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export default function CrmAccountsPage() {
  return (
    <CrmApp nowMs={now().getTime()}>
      <Suspense fallback={<CrmTableSkeleton label="Loading accounts" />}>
        <AccountsScreen />
      </Suspense>
    </CrmApp>
  )
}
