import { NextResponse } from "next/server"
import { getCardById, updateCard } from "@/lib/hq/store"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = getCardById(id)
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(card)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const allowed = ["status", "owner", "label", "description", "estimate_hours", "title"]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  const updated = updateCard(id, patch as Parameters<typeof updateCard>[1])
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
