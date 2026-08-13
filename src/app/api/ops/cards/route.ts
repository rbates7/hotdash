import { NextResponse } from "next/server"
import { getAllOpsCards } from "@/lib/ops/store"

export async function GET() {
  return NextResponse.json(getAllOpsCards())
}
