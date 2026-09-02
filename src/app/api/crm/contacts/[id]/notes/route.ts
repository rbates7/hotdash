import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { addContactNote, CONTACT_NOTE_KINDS } from "@/lib/crm/notes/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  body: z.string().min(1).max(20_000),
  kind: z.enum(CONTACT_NOTE_KINDS).default("user"),
  /** When a call happened, as the browser's datetime-local value. */
  at: z.string().max(40).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = bodySchema.parse(await request.json())
    const note = addContactNote(getDb(), id, {
      body: body.body,
      kind: body.kind,
      at: body.at ? new Date(body.at) : undefined,
    })
    return Response.json({ note })
  } catch (error) {
    return jsonError(error, "Failed to add the note.")
  }
}
