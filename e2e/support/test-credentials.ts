/**
 * TEST-ONLY sign-in credentials for the Playwright web server and CI.
 *
 * These are NOT real secrets and must never be used on a deployed site.
 * They exist so e2e can sign in against a local `next start`/`next dev`.
 * The same values are set in .github/workflows/ci.yml — keep them in step.
 *
 * TEST_PASSWORD_HASH was made with `printf '%s' "$TEST_PASSWORD" | pnpm -s auth:hash`.
 */
export const TEST_ADMIN_EMAIL = "founder@example.test"
export const TEST_PASSWORD = "test-only-password-123"
export const TEST_PASSWORD_HASH =
  "scrypt$32768$8$1$CUDnCcpP3PW/111lcw8oeQ==$Sx3j9M02rMDNxlpkWtI6M/my57xpBoMcsLxVaE8kwmg="
export const TEST_AUTH_SECRET = "test-only-auth-secret-not-for-production-0123456789"

/** Env for the Playwright web server. */
export const TEST_AUTH_ENV = {
  ADMIN_EMAIL: TEST_ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH: TEST_PASSWORD_HASH,
  AUTH_SECRET: TEST_AUTH_SECRET,
}

/** Where the setup project saves the signed-in browser state (gitignored). */
export const SIGNED_IN_STATE = "playwright/.auth/founder.json"
