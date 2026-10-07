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
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
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
  },
})
