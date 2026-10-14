import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

/**
 * scrypt password hashes in the form `scrypt$N$r$p$saltB64$hashB64`.
 *
 * Node only — the proxy never imports this. Produce a hash with
 * `pnpm auth:hash` (scripts/hash-password.mjs mirrors hashPassword()).
 */

type ScryptParams = { N: number; r: number; p: number }

export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 15, r: 8, p: 1 }
const SALT_BYTES = 16
const KEY_BYTES = 32

type Parsed = ScryptParams & { salt: Buffer; hash: Buffer }

function deriveKey(password: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, opts, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  })
}

/** Memory scrypt needs is 128·N·r bytes; Node's default cap (32 MiB) is too tight. */
function options({ N, r, p }: ScryptParams): ScryptOptions {
  return { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }
}

export async function hashPassword(
  password: string,
  { N, r, p } = DEFAULT_SCRYPT
): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await deriveKey(password, salt, KEY_BYTES, options({ N, r, p }))
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$")
}

/**
 * Parse a stored hash, rejecting parameters that are malformed or would let a
 * bad env value pin the CPU or exhaust memory.
 */
export function parsePasswordHash(stored: string): Parsed | null {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return null
  const [N, r, p] = parts.slice(1, 4).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))
  if (!Number.isSafeInteger(N) || N < 2 ** 10 || N > 2 ** 20 || (N & (N - 1)) !== 0) return null
  if (!Number.isSafeInteger(r) || r < 1 || r > 32) return null
  if (!Number.isSafeInteger(p) || p < 1 || p > 16) return null
  const salt = Buffer.from(parts[4], "base64")
  const hash = Buffer.from(parts[5], "base64")
  if (salt.length < 8 || hash.length < 16 || hash.length > 128) return null
  return { N, r, p, salt, hash }
}

/** True when `password` matches `stored`. Constant-time on the derived key. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored)
  if (!parsed) return false
  const derived = await deriveKey(password, parsed.salt, parsed.hash.length, options(parsed))
  return timingSafeEqual(derived, parsed.hash)
}
