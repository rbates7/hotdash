import { NextResponse } from "next/server"
import { appendComment } from "@/lib/hq/store"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { author, body: text } = body
  if (!author || !text) {
    return NextResponse.json({ error: "author and body required" }, { status: 400 })
  }
  const updated = appendComment(id, author, text)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}
