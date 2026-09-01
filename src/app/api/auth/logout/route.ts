import { SESSION_COOKIE } from "@/lib/auth/cookie"
import { jsonError } from "@/lib/core/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } })
  } catch (error) {
    return jsonError(error, "Failed to sign out.")
  }
}
