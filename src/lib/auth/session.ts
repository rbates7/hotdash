/**
 * Signed session cookie: `<payload>.<signature>`, both base64url. The payload
 * is `{ sub, iat, exp }` JSON; the signature is HMAC-SHA256 over the encoded
 * payload with AUTH_SECRET.
 *
 * Uses Web Crypto only (no node:crypto) so the same code runs in the proxy.
 * crypto.subtle.verify compares the MAC in constant time.
 *
 * Sessions are stateless: signing out clears this browser's cookie, but a
 * copied token stays valid until it expires. Rotating AUTH_SECRET (or
 * changing ADMIN_EMAIL) revokes every session at once.
 */

export const SESSION_COOKIE = "hotdash_session"
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export type Session = {
  /** The signed-in email. */
  sub: string
  /** Issued / expires, in whole seconds since the epoch. */
  iat: number
  exp: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

const keys = new Map<string, Promise<CryptoKey>>()

function hmacKey(secret: string) {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    )
    // Normally one entry; a rotated secret adds a second. Never grows past that.
    if (keys.size > 4) keys.clear()
    keys.set(secret, key)
  }
  return key
}

export async function signSession(
  email: string,
  secret: string,
  nowMs = Date.now()
): Promise<string> {
  const iat = Math.floor(nowMs / 1000)
  const session: Session = { sub: email, iat, exp: iat + SESSION_TTL_SECONDS }
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)))
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(payload)
  )
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * The session in `token` if its signature is valid, it has not expired, and
 * it belongs to `expectedEmail`; otherwise null. Never throws.
 */
export async function verifySession(
  token: string | undefined,
  secret: string,
  expectedEmail: string,
  nowMs = Date.now()
): Promise<Session | null> {
  if (!token || token.length > 4096) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, signatureText] = parts
  const signature = fromBase64Url(signatureText)
  if (!signature || !fromBase64Url(payload)) return null

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(payload)
  )
  if (!valid) return null

  let session: unknown
  try {
    session = JSON.parse(decoder.decode(fromBase64Url(payload)!))
  } catch {
    return null
  }
  if (!isSession(session)) return null
  const now = Math.floor(nowMs / 1000)
  if (session.exp <= now || session.iat > now + 60) return null
  if (session.sub !== expectedEmail) return null
  return session
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.sub === "string" &&
    Number.isInteger(v.iat) &&
    Number.isInteger(v.exp)
  )
}

/** Cookie attributes for the session (and for clearing it). */
export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}
