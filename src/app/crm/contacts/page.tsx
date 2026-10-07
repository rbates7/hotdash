import { Suspense } from "react"

import { now } from "@/lib/clock"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import { CrmApp } from "@/components/crm/crm-app"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export default function CrmContactsPage() {
  return (
    <CrmApp nowMs={now().getTime()}>
      <Suspense fallback={<CrmTableSkeleton label="Loading saved contacts" />}>
        <ContactsScreen />
      </Suspense>
    </CrmApp>
  )
}
