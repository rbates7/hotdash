import type { Metadata } from "next"

import { AccountDetail } from "@/components/crm/accounts/account-detail"

export const metadata: Metadata = { title: "Organization" }
export const dynamic = "force-dynamic"

export default async function CrmAccountPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <AccountDetail orgId={orgId} />
}
