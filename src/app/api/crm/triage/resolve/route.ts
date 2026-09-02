import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { resolveTriage } from "@/lib/crm/triage/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  gmailThreadId: z.string().min(1),
  senderEmail: z.string().min(1).max(320).optional(),
  action: z.enum(["promote", "link", "ignore"]),
  contactId: z.string().optional(),
  ignoreSenderAlways: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    const result = resolveTriage(getDb(), body)
    return Response.json(result)
  } catch (error) {
    return jsonError(error, "Failed to resolve the triage item.")
  }
}
