import { normalizeEmail } from "@/lib/gate/config"

const encoder = new TextEncoder()

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))
}

/**
 * Constant-time string equality: both sides are hashed to 32 bytes first, so
 * neither the length nor the first differing byte shows in the timing.
 */
export async function timingSafeEqualText(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/**
 * Both checks always run (no early exit on a wrong email), each in
 * constant time. Email is trimmed and case-insensitive; the password is exact.
 */
export async function credentialsMatch(
  input: { email: string; password: string },
  expected: { email: string; secret: string }
): Promise<boolean> {
  const [emailOk, passwordOk] = await Promise.all([
    timingSafeEqualText(normalizeEmail(input.email), expected.email),
    timingSafeEqualText(input.password, expected.secret),
  ])
  return emailOk && passwordOk
}
