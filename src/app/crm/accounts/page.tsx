import type { Metadata } from "next"
import { Suspense } from "react"

import { AccountsScreen } from "@/components/crm/accounts/accounts-screen"

export const metadata: Metadata = { title: "Accounts" }
export const dynamic = "force-dynamic"

/** Organizations and their users. The data is read in the browser from the gated `/api/crm/accounts`. */
export default function CrmAccountsPage() {
  return (
    <Suspense>
      <AccountsScreen />
    </Suspense>
  )
}
