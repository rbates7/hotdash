import { now } from "@/lib/clock"
import { ContactDetail } from "@/components/crm/contact-detail"
import { CrmApp } from "@/components/crm/crm-app"

export default async function CrmContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <CrmApp nowMs={now().getTime()}>
      <ContactDetail contactId={id} />
    </CrmApp>
  )
}
