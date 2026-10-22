import { jsonError, refuseCrossSite } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { deleteUserNote } from "@/lib/crm/notes/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const refused = refuseCrossSite(request)
    if (refused) return refused
    const { id } = await params
    await deleteUserNote(getDb(), id)
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error, "Failed to delete the note.")
  }
}
