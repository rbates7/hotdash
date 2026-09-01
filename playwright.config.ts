import { defineConfig } from "@playwright/test"

const PORT = 3400

// One worker, alphabetical order: the specs share a seeded SQLite database
// and later specs mutate what earlier specs assert on.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      // Sandbox/CI environments can point at a preinstalled Chromium.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    // Production build: fast hydration keeps interactions deterministic.
    command: `pnpm exec tsx scripts/seed-e2e.ts && pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_PATH: "./.tmp/e2e.db",
      APP_PASSWORD: "e2e-pass",
      APP_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      DISABLE_SYNC_SCHEDULER: "1",
    },
  },
})
