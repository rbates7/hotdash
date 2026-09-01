import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { addUserNote } from "@/lib/crm/notes/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ body: z.string().min(1).max(20_000) })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = bodySchema.parse(await request.json())
    const note = addUserNote(getDb(), id, body.body)
    return Response.json({ note })
  } catch (error) {
    return jsonError(error, "Failed to add the note.")
  }
}
