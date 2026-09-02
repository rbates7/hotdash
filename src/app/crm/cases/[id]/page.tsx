import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CaseDetail } from "@/components/crm/case-detail"
import { getCaseWithTimeline } from "@/lib/crm/cases/server"
import { NotFoundError } from "@/lib/crm/core/errors"
import { getDb } from "@/lib/crm/db/client"

export const metadata: Metadata = { title: "Case · CRM · Chlk" }
export const dynamic = "force-dynamic"

// The full-page view of a case, for direct links and search results. From
// the Cases list, a case opens beside the list instead (see cases/page.tsx).
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const caseRow = await getCaseWithTimeline(getDb(), id).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  return <CaseDetail caseRow={caseRow} variant="page" />
}
