import { CaseDetail } from "@/components/crm/case-detail"

export default async function CrmCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CaseDetail caseId={id} />
}
