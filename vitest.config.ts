import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// The suite runs in two zones in CI (`pnpm test` = UTC, `pnpm test:tz` =
// America/Chicago). A bare `vitest` gets UTC so results never depend on the
// developer's machine; src/test/tz.test.ts asserts the zone actually took.
process.env.TZ ??= "UTC"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
})
