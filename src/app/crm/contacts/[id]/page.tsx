import { ContactDetail } from "@/components/crm/contact-detail"

export default async function CrmContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ContactDetail contactId={id} />
}
