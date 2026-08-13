import { NextResponse } from "next/server"
import { getAllCards } from "@/lib/hq/store"

export async function GET() {
  const cards = getAllCards()
  return NextResponse.json(cards)
}
