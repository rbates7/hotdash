import { NextResponse } from "next/server"
import { getOpsCardById, updateOpsCard } from "@/lib/ops/store"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = getOpsCardById(id)
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(card)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const ALLOWED = new Set(["status", "owner", "description", "blocker_reason", "title"])
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED.has(key)) patch[key] = body[key]
  }
  const updated = updateOpsCard(id, patch)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
