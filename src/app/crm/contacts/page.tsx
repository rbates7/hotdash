import { Suspense } from "react"

import { ContactsScreen } from "@/components/crm/contacts-screen"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"

export default function CrmContactsPage() {
  return (
    <Suspense fallback={<CrmTableSkeleton label="Loading saved contacts" />}>
      <ContactsScreen />
    </Suspense>
  )
}
