import { z } from "zod"

import { updateContactManual } from "@/lib/crm/contacts/server"
import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  firstName: z.string().max(200).nullable().optional(),
  lastName: z.string().max(200).nullable().optional(),
  organizationName: z.string().max(200).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = bodySchema.parse(await request.json())
    const contact = updateContactManual(getDb(), id, body)
    return Response.json({ contact })
  } catch (error) {
    return jsonError(error, "Failed to update the contact.")
  }
}
