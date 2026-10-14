import { cookies } from "next/headers"

import { getAuthConfig } from "@/lib/auth/config"
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/auth/session"

/**
 * The verified session for this request, or null. For Server Components and
 * Server Functions: the proxy already locks every route, but each server
 * entry point checks again rather than trusting that alone.
 */
export async function getSession(): Promise<Session | null> {
  const config = getAuthConfig()
  if (!config) return null
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return verifySession(token, config.secret, config.email)
}

/** The client address for rate limiting. Vercel sets x-forwarded-for. */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown"
}
