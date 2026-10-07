import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PHONE_MAX_WIDTH,
  PHONE_QUERY,
  TABLET_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  TABLET_QUERY,
  useIsMobile,
  useIsTablet,
} from "@/hooks/use-mobile"

const nativeMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

function mockViewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query === PHONE_QUERY
        ? width <= PHONE_MAX_WIDTH
        : query === TABLET_QUERY
          ? width >= TABLET_MIN_WIDTH && width <= TABLET_MAX_WIDTH
          : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe("viewport hooks", () => {
  it("treats 390 as phone, 820 as tablet, 1180+ as desktop rail", () => {
    mockViewport(390)
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
    expect(renderHook(() => useIsTablet()).result.current).toBe(false)

    mockViewport(820)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
    expect(renderHook(() => useIsTablet()).result.current).toBe(true)

    mockViewport(1180)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
    expect(renderHook(() => useIsTablet()).result.current).toBe(false)

    mockViewport(1440)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
    expect(renderHook(() => useIsTablet()).result.current).toBe(false)
  })
})
