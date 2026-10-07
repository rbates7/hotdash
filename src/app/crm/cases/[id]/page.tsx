import { now } from "@/lib/clock"
import { CaseDetail } from "@/components/crm/case-detail"
import { CrmApp } from "@/components/crm/crm-app"

export default async function CrmCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <CrmApp nowMs={now().getTime()}>
      <CaseDetail caseId={id} />
    </CrmApp>
  )
}
