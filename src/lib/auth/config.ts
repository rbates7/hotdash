/**
 * Sign-in settings, read from the environment on every call so a missing or
 * rotated value takes effect without a rebuild (and tests can stub it).
 *
 * Fails closed: if any value is missing or malformed this returns null and
 * nobody can sign in — /sign-in says so instead of showing the form.
 *
 * Edge-safe: no Node imports, because the proxy reads it too.
 */

/** HMAC-SHA256 key material for the session cookie. */
export const MIN_SECRET_LENGTH = 32

export type AuthConfig = {
  /** Normalised (trimmed, lowercased) — compare against normaliseEmail(). */
  email: string
  /** `scrypt$N$r$p$saltB64$hashB64`, see lib/auth/password.ts. */
  passwordHash: string
  secret: string
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase()
}

type Env = Record<string, string | undefined>

export function getAuthConfig(env: Env = process.env): AuthConfig | null {
  const email = normaliseEmail(env.ADMIN_EMAIL ?? "")
  const passwordHash = (env.ADMIN_PASSWORD_HASH ?? "").trim()
  const secret = env.AUTH_SECRET ?? ""

  if (!email.includes("@")) return null
  if (!passwordHash.startsWith("scrypt$")) return null
  if (secret.length < MIN_SECRET_LENGTH) return null

  return { email, passwordHash, secret }
}
