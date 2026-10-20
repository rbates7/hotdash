import fs from "node:fs"

import { defineConfig, devices } from "@playwright/test"

import { assertNoSecrets, blankSecretLike, parseEnvLines } from "./scripts/shot-env.mjs"

const PORT = Number(process.env.PORT ?? 3001)
const baseURL = `http://localhost:${PORT}`

// Every name the app reads a credential from, blanked for the server
// Playwright starts, on top of every secret-like name in this shell.
const KNOWN_SECRETS = [
  "STRIPE_READONLY_KEY", "STRIPE_API_BASE", "SUPABASE_READONLY_DB_URL", "POSTHOG_READONLY_KEY", "POSTHOG_HOST",
  "GITHUB_READONLY_TOKEN", "github_read_only", "SENTRY_READONLY_TOKEN", "NOTION_READONLY_TOKEN",
  "NOTION_ROADMAP_PAGE_ID", "NOTION_API_BASE", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN",
  "GMAIL_MAILBOX", "DASHBOARD_LOGIN_EMAIL", "DASHBOARD_GATE_SECRET",
]
const serverEnv = blankSecretLike(process.env, KNOWN_SECRETS)
assertNoSecrets({ ...process.env, ...serverEnv }, "playwright webServer env")

// Screenshots are published for review, so they must never show live data.
// A server Playwright starts (CI=true) has the env above. A server it reuses
// was started by someone else: only a reshoot script's server is accepted,
// and only if the env it was given (SHOT_SERVER_ENV_FILE) has no secret.
if (process.env.SCREENSHOTS && !process.env.CI) {
  const file = process.env.SHOT_SERVER_ENV_FILE
  if (!file || !fs.existsSync(file)) {
    throw new Error(
      "SCREENSHOTS against a reused server needs SHOT_SERVER_ENV_FILE from scripts/*-reshoot.sh; " +
        "or set CI=true so Playwright starts a key-less production server itself"
    )
  }
  assertNoSecrets(parseEnvLines(fs.readFileSync(file, "utf8")), `screenshot server env (${file})`)
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Policy: one retry in CI so a transient failure leaves a second trace to
  // diagnose, but the CI script runs with --fail-on-flaky-tests (see
  // `test:e2e:ci`), so a pass-on-retry still fails the run. A retry can
  // explain a flake; it can never hide one.
  retries: process.env.CI ? 1 : 0,
  // CI also writes the HTML report (never opened), so the "Upload Playwright
  // report" step has a report to upload on every run, green or red.
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // CI builds first so the smoke runs against the production bundle; locally
  // it reuses a dev server you already have on the port.
  webServer: {
    command: process.env.CI
      ? `pnpm start --port ${PORT}`
      : `pnpm dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // e2e never talks to Stripe, PostHog, Notion, Chlk's database, GitHub,
    // Sentry or Gmail: the server it starts has every secret-like variable
    // blank, KNOWN_SECRETS included (so all are "not connected"), and specs
    // mock /api/stripe/*, /api/posthog/*, /api/notion/roadmap, /api/crm/gmail
    // and /api/inbox in the browser for the connected and stale states. This
    // holds even on a machine whose shell has any of them
    // (src/test/shot-env.test.ts).
    env: serverEnv,
  },
})
