import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { COMPACT_MAX_WIDTH, COMPACT_QUERY, useIsMobile } from "@/hooks/use-mobile"

const nativeMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

function mockMatchMedia(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === COMPACT_QUERY && width <= COMPACT_MAX_WIDTH,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe("useIsMobile", () => {
  it("is compact on phone and tablet portrait, not on tablet landscape or desktop", () => {
    mockMatchMedia(390)
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)

    mockMatchMedia(820)
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)

    mockMatchMedia(1180)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)

    mockMatchMedia(1440)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })
})
