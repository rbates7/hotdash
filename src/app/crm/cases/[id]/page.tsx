import { redirect } from "next/navigation"

/**
 * The old deep link to a case: it opens the same case in the Cases panel
 * (`/crm/cases?case=<id>`), so every link to a case keeps working.
 */
export default async function CrmCaseDeepLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/crm/cases?case=${encodeURIComponent(id)}`)
}
