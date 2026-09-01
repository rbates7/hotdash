import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"

// AES-256-GCM for secrets at rest (Google OAuth tokens). The key is derived
// from APP_SECRET so a leaked database file alone does not leak tokens.

function tokenKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "hotdash", "token-encryption-v1", 32)
  )
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", tokenKey(secret), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".")
}

export function decryptSecret(encoded: string, secret: string): string {
  const [ivPart, ctPart, tagPart] = encoded.split(".")
  if (!ivPart || !ctPart || !tagPart) {
    throw new Error("Malformed encrypted secret.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenKey(secret),
    Buffer.from(ivPart, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
