import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// next/navigation needs an App Router context that jsdom does not provide.
// Tests that exercise URL state pass their own search params through this.
export const navigation = {
  push: vi.fn(),
  params: new URLSearchParams(),
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/agent-workplace",
}))
