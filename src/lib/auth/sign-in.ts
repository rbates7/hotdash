import { createHash, timingSafeEqual } from "node:crypto"

import { normaliseEmail, type AuthConfig } from "@/lib/auth/config"
import { verifyPassword } from "@/lib/auth/password"
import { AUTH_COPY as MESSAGES } from "@/lib/auth/messages"
import { minutesUntil, type RateLimiter } from "@/lib/auth/rate-limit"

export type SignInResult = { ok: true; email: string } | { ok: false; error: string }

/** Constant-time string equality (hashing first evens out the lengths). */
function sameText(a: string, b: string) {
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * Check one sign-in attempt. Node only (scrypt). The caller sets the cookie
 * on success. Rate limited per IP + email; a success clears that key.
 */
export async function attemptSignIn({
  email: rawEmail,
  password,
  ip,
  config,
  limiter,
  now = Date.now(),
}: {
  email: string
  password: string
  ip: string
  config: AuthConfig | null
  limiter: RateLimiter
  now?: number
}): Promise<SignInResult> {
  if (!config) return { ok: false, error: MESSAGES.notConfigured }

  const email = normaliseEmail(rawEmail)
  if (!email || !password) return { ok: false, error: MESSAGES.missing }

  const key = `${ip}|${email}`
  const gate = limiter.check(key, now)
  if (!gate.allowed) return { ok: false, error: MESSAGES.tooMany(minutesUntil(gate.retryAfterMs)) }

  // Always run scrypt, so a wrong email costs the same time as a wrong password.
  const passwordOk = await verifyPassword(password, config.passwordHash)
  const emailOk = sameText(email, config.email)
  if (passwordOk && emailOk) {
    limiter.reset(key)
    return { ok: true, email: config.email }
  }

  const after = limiter.fail(key, now)
  if (!after.allowed) return { ok: false, error: MESSAGES.tooMany(minutesUntil(after.retryAfterMs)) }
  return { ok: false, error: MESSAGES.incorrect }
}
