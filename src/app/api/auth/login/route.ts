import { createHash, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  signSession,
} from "@/lib/auth/cookie"
import { AuthError } from "@/lib/core/errors"
import { jsonError } from "@/lib/core/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ password: z.string().min(1) })

function matchesPassword(candidate: string, actual: string) {
  const a = createHash("sha256").update(candidate).digest()
  const b = createHash("sha256").update(actual).digest()
  return timingSafeEqual(a, b)
}

function isSecureRequest(request: Request) {
  const proto = request.headers.get("x-forwarded-proto")
  if (proto) return proto.split(",")[0]!.trim() === "https"
  return new URL(request.url).protocol === "https:"
}

export async function POST(request: Request) {
  try {
    const password = process.env.APP_PASSWORD
    if (!password) return Response.json({ ok: true })

    const secret = process.env.APP_SECRET
    if (!secret) {
      throw new Error("APP_SECRET must be set when APP_PASSWORD is used.")
    }

    const body = bodySchema.parse(await request.json())
    if (!matchesPassword(body.password, password)) {
      throw new AuthError("Wrong password.")
    }

    const token = await signSession(secret, Date.now() + SESSION_DURATION_MS)
    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
      isSecureRequest(request) ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")

    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } })
  } catch (error) {
    return jsonError(error, "Failed to sign in.")
  }
}
