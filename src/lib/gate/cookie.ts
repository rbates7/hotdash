/**
 * The gate cookie: `v1.<exp>.<signature>`. The signature is HMAC-SHA256,
 * keyed with DASHBOARD_GATE_SECRET, over `hotdash-gate|v1|<email>|<exp>`.
 *
 * - Changing the secret (or the email) invalidates every cookie at once.
 * - Bumping COOKIE_VERSION does the same without touching settings.
 * - Stateless: logging out clears this browser's cookie; a copied cookie
 *   stays valid until it expires (7 days) or the secret changes.
 *
 * Web Crypto only, so it runs anywhere the proxy runs. crypto.subtle.verify
 * compares the MAC in constant time.
 */

export const GATE_COOKIE = "hotdash_gate"
export const COOKIE_VERSION = "v1"
export const GATE_TTL_SECONDS = 7 * 24 * 60 * 60

const encoder = new TextEncoder()

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
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ])
    // Normally one entry; a rotated secret adds a second. Never grows past a few.
    if (keys.size > 4) keys.clear()
    keys.set(secret, key)
  }
  return key
}

function message(email: string, exp: number) {
  return encoder.encode(`hotdash-gate|${COOKIE_VERSION}|${email}|${exp}`)
}

export async function signGateCookie(email: string, secret: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + GATE_TTL_SECONDS
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), message(email, exp))
  return `${COOKIE_VERSION}.${exp}.${toBase64Url(new Uint8Array(mac))}`
}

/** True if `token` is a current-version, unexpired cookie for this email and secret. Never throws. */
export async function verifyGateCookie(
  token: string | undefined,
  email: string,
  secret: string,
  nowMs = Date.now()
): Promise<boolean> {
  if (!token || token.length > 256) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false
  const [version, expText, macText] = parts
  if (version !== COOKIE_VERSION || !/^\d{1,12}$/.test(expText)) return false
  const exp = Number(expText)
  const now = Math.floor(nowMs / 1000)
  // Expired, or claims to outlive the TTL (a cookie we never issued).
  if (exp <= now || exp > now + GATE_TTL_SECONDS + 60) return false
  const mac = fromBase64Url(macText)
  if (!mac) return false
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), mac, message(email, exp))
  } catch {
    return false
  }
}

/**
 * Cookie attributes. Always Secure (browsers still accept it on
 * http://localhost), httpOnly, SameSite=Lax, whole site.
 */
export function gateCookieOptions(maxAge = GATE_TTL_SECONDS) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge }
}
