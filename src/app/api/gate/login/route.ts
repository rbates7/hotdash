import { NextResponse } from "next/server"

import { getGateConfig } from "@/lib/gate/config"
import { GATE_COOKIE, gateCookieOptions, signGateCookie } from "@/lib/gate/cookie"
import { credentialsMatch } from "@/lib/gate/credentials"
import { DEFAULT_NEXT, UNLOCK_PATH } from "@/lib/gate/paths"
import { clientKey, loginLimiter } from "@/lib/gate/rate-limit"
import { safeNext } from "@/lib/gate/safe-next"
import { isSameOrigin } from "@/lib/gate/same-origin"

export const dynamic = "force-dynamic"

function backToUnlock(request: Request, error: "invalid" | "limited" | "misconfigured", next: string) {
  const url = new URL(UNLOCK_PATH, request.url)
  url.searchParams.set("error", error)
  if (next !== DEFAULT_NEXT) url.searchParams.set("next", next)
  return NextResponse.redirect(url, 303)
}

/**
 * The unlock form posts here. Right email + password → signed cookie and a
 * 303 to `next` (same-origin relative only). Anything else → back to
 * /unlock with one generic error; the response never says which field was
 * wrong. Neither the submitted values nor the settings are ever logged.
 */
export async function POST(request: Request) {
  const config = getGateConfig()
  if (config.mode === "off") return NextResponse.redirect(new URL("/", request.url), 303)
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return backToUnlock(request, "invalid", DEFAULT_NEXT)
  }
  const next = safeNext(form.get("next"), new URL(request.url).origin)
  if (config.mode === "misconfigured") return backToUnlock(request, "misconfigured", next)

  const key = clientKey(request.headers)
  if (!loginLimiter.check(key).allowed) return backToUnlock(request, "limited", next)

  const email = String(form.get("email") ?? "").slice(0, 320)
  const password = String(form.get("password") ?? "").slice(0, 1024)
  if (!(await credentialsMatch({ email, password }, config))) {
    loginLimiter.fail(key)
    return backToUnlock(request, "invalid", next)
  }

  loginLimiter.reset(key)
  const response = NextResponse.redirect(new URL(next, request.url), 303)
  response.cookies.set(GATE_COOKIE, await signGateCookie(config.email, config.secret), gateCookieOptions())
  return response
}
