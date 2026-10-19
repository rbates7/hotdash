import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.PORT ?? 3001)
const baseURL = `http://localhost:${PORT}`

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
    // e2e never talks to Stripe, PostHog, Notion, Chlk's database, GitHub or
    // Gmail: the server it starts has no keys, tokens, Notion page, database
    // URL or Gmail credentials (so all are "not connected"), and specs mock
    // /api/stripe/*, /api/posthog/*, /api/notion/roadmap and /api/crm/gmail in
    // the browser for the connected and stale states. This holds even on a
    // machine whose shell has any of them.
    env: {
      STRIPE_READONLY_KEY: "",
      STRIPE_API_BASE: "",
      SUPABASE_READONLY_DB_URL: "",
      POSTHOG_READONLY_KEY: "",
      POSTHOG_HOST: "",
      NOTION_READONLY_TOKEN: "",
      NOTION_ROADMAP_PAGE_ID: "",
      NOTION_API_BASE: "",
      GITHUB_READONLY_TOKEN: "",
      github_read_only: "",
      GMAIL_CLIENT_ID: "",
      GMAIL_CLIENT_SECRET: "",
      GMAIL_REFRESH_TOKEN: "",
      GMAIL_MAILBOX: "",
    },
  },
})
