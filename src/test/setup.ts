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

// Recharts' ResponsiveContainer measures itself with a ResizeObserver, which
// jsdom lacks, and warns about a 0×0 box. Give every chart a fixed box
// instead: the sparklines are 120×52 by design, and chart internals are not
// what component tests assert on.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  const React = await import("react")
  function ResponsiveContainer({
    children,
    initialDimension,
  }: {
    children: React.ReactNode
    initialDimension?: { width: number; height: number }
  }) {
    const width = initialDimension?.width ?? 120
    const height = initialDimension?.height ?? 52
    const child = React.Children.only(children) as React.ReactElement<{ width?: number; height?: number }>
    return React.createElement(
      "div",
      { className: "recharts-responsive-container", style: { width, height } },
      React.cloneElement(child, { width, height })
    )
  }
  return { ...actual, ResponsiveContainer }
})
