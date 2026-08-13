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

  // Only allow these fields; pass null through so the store can clear optional fields
  const ALLOWED = new Set(["status", "owner", "label", "description", "estimate_hours", "title"])
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED.has(key)) patch[key] = body[key]
  }

  const updated = updateCard(id, patch)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
