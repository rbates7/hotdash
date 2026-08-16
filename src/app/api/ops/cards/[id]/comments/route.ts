import { NextResponse } from "next/server"
import { appendOpsComment } from "@/lib/ops/store"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { author, body } = await req.json()
  if (!author || !body) {
    return NextResponse.json({ error: "author and body required" }, { status: 400 })
  }
  const updated = appendOpsComment(id, author, body)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
