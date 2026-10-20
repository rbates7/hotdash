/**
 * The dashboard login gate's settings. Two server-only env vars:
 *
 * - DASHBOARD_LOGIN_EMAIL: the one email that may sign in.
 * - DASHBOARD_GATE_SECRET: the password, and the HMAC key that signs the
 *   gate cookie. Changing it signs everyone out.
 *
 * Neither set → the gate is off (CI and local dev stay open).
 * Both set → the gate is on.
 * Only one set → fail closed: everything stays locked and /unlock says the
 * gate is misconfigured. Values are never logged; only the missing name is.
 *
 * Read on every request (not cached at module load) so tests and a
 * redeploy with new settings behave the same way.
 */

export const LOGIN_EMAIL_ENV = "DASHBOARD_LOGIN_EMAIL"
export const GATE_SECRET_ENV = "DASHBOARD_GATE_SECRET"

export type GateConfig =
  | { mode: "off" }
  | { mode: "misconfigured"; missing: string }
  | { mode: "on"; email: string; secret: string }

/** Email comparison form: trimmed and lower-cased. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

let warned = false

export function getGateConfig(env: Record<string, string | undefined> = process.env): GateConfig {
  const email = normalizeEmail(env[LOGIN_EMAIL_ENV] ?? "")
  // The password is used exactly as set; only an all-whitespace value counts as unset.
  const rawSecret = env[GATE_SECRET_ENV] ?? ""
  const secret = rawSecret.trim() === "" ? "" : rawSecret

  if (!email && !secret) return { mode: "off" }
  if (email && secret) return { mode: "on", email, secret }

  const missing = email ? GATE_SECRET_ENV : LOGIN_EMAIL_ENV
  if (!warned) {
    warned = true
    // Name only, never a value.
    console.warn(`dashboard gate: misconfigured (${missing} is not set); everything stays locked`)
  }
  return { mode: "misconfigured", missing }
}
