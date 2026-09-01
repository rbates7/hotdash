// Session cookie signing/verification. Web Crypto only, so it runs in the
// proxy (middleware) on any runtime as well as in route handlers.

export const SESSION_COOKIE = "hd_session"
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

async function importHmacKey(secret: string) {
  // Prefix domain-separates this key from other uses of APP_SECRET.
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`hotdash-cookie-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

function toBase64Url(bytes: ArrayBuffer) {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function constantTimeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!
  }
  return diff === 0
}

export async function signSession(
  secret: string,
  expiresAtMs: number
): Promise<string> {
  const payload = String(expiresAtMs)
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return `${payload}.${toBase64Url(sig)}`
}

export async function verifySession(
  value: string,
  secret: string,
  now = Date.now()
): Promise<boolean> {
  const dot = value.indexOf(".")
  if (dot <= 0) return false
  const payload = value.slice(0, dot)
  const expiresAtMs = Number(payload)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false
  const expected = await signSession(secret, expiresAtMs)
  return constantTimeEqual(value, expected)
}
