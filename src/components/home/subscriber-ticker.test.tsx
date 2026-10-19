import * as React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANNOUNCE_MIN_MS, CROSSFADE_MS, ERROR_TOOLTIP, FLAP_MS, LOADING_LABEL } from "@/lib/subscriber-ticker"
import type { SubscriberReading, SubscriberSource } from "@/lib/subscriber-source"
import { updateSettings } from "@/hooks/use-settings"
import { SubscriberTicker, TICKER_HREF } from "@/components/home/subscriber-ticker"
import { NOT_CONNECTED } from "@/lib/stripe-summary"
import { APP_STORE_OFF, LIVE_METRICS, liveSummary, setStripeSummaryForTest } from "@/test/stripe"

const AT = new Date("2026-10-13T14:41:00Z")
const reading = (total: number, today = 0): SubscriberReading => ({ total, today, at: AT })

/** A source the test drives: `set` changes the count and pushes; `fail` makes reads reject. */
function controlled(start: SubscriberReading | null, { sample = true } = {}) {
  let current: SubscriberReading | null = start
  let failing = false
  const listeners = new Set<() => void>()
  const source: SubscriberSource = {
    sample,
    initial: () => start,
    read: async () => {
      if (failing || !current) throw new Error("down")
      return current
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  const push = async () => {
    await act(async () => {
      for (const l of listeners) l()
      await vi.advanceTimersByTimeAsync(0)
    })
  }
  return {
    source,
    set: async (r: SubscriberReading) => {
      current = r
      failing = false
      await push()
    },
    fail: async () => {
      failing = true
      await push()
    },
  }
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const tiles = () => screen.getByTestId("ticker-tiles")
const status = () => screen.getByRole("status")
/** What the live region says: its one sr-only text (it has no aria-label). */
const spoken = () => status().querySelector(".sr-only")?.textContent

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})
afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error jsdom has no matchMedia of its own
  delete window.matchMedia
})

describe("SubscriberTicker", () => {
  it("is a polite status with the full figure; tiles are hidden from AT", async () => {
    const { source } = controlled(reading(1_284, 3))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(status()).toHaveAttribute("aria-live", "polite")
    expect(spoken()).toBe("Subscribers: 1,284, up 3 today")
    // One name, said once: no aria-label repeating the sr-only text.
    expect(status()).not.toHaveAttribute("aria-label")
    expect(status()).toHaveAttribute("aria-busy", "false")
    expect(tiles()).toHaveAttribute("aria-hidden", "true")
    expect(tiles().textContent).toBe("11,228844") // each digit in both halves
    expect(screen.getByRole("link")).toHaveAttribute("href", TICKER_HREF)
    expect(screen.getByRole("link")).toHaveAccessibleName("Subscribers: 1,284, up 3 today")
    // The delta chip, on the header only.
    expect(screen.getByText("+3")).toBeInTheDocument()
  })

  it("wears the shared Sample chip, always (no setting hides it)", async () => {
    const { source } = controlled(reading(186))
    render(<SubscriberTicker variant="header" source={source} />)
    expect(screen.getByTestId("sample-data-tag")).toHaveTextContent("Sample data")
    expect(spoken()).toBe("Subscribers: 186, no change today")
  })

  it("the phone bar uses the compact chip and no visible label", () => {
    const { source } = controlled(reading(186))
    render(<SubscriberTicker variant="bar" source={source} />)
    const tag = screen.getByTestId("sample-data-tag")
    expect(tag).toHaveAttribute("title", "Sample data")
    expect(tag).toHaveTextContent("Sample data") // sr-only
    expect(screen.queryByText("Subscribers")).not.toBeInTheDocument()
  })

  it("has no Sample chip for a real source", () => {
    const { source } = controlled(reading(186), { sample: false })
    render(<SubscriberTicker variant="header" source={source} />)
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })

  it("compacts on the bar past 5 digits", () => {
    const { source } = controlled(reading(128_400))
    render(<SubscriberTicker variant="bar" source={source} />)
    expect(tiles().textContent).toBe("112288K")
    expect(spoken()).toBe("Subscribers: 128,400, no change today")
  })

  it("loading: en-dash tiles, aria-busy, never a number", () => {
    const source: SubscriberSource = { sample: true, initial: () => null, read: () => new Promise(() => {}) }
    render(<SubscriberTicker variant="header" source={source} />)
    expect(status()).toHaveAttribute("aria-busy", "true")
    expect(spoken()).toBe(LOADING_LABEL)
    expect(tiles().textContent).toBe("––,––––––")
  })

  it("loading → first figure does not start the once-a-minute clock: the next change is spoken at once", async () => {
    const { source, set } = controlled(null)
    render(<SubscriberTicker variant="header" source={source} />)
    expect(spoken()).toBe(LOADING_LABEL)
    await set(reading(186))
    expect(spoken()).toBe("Subscribers: 186, no change today")
    await set(reading(187, 1))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(spoken()).toBe("Subscribers: 187, up 1 today")
  })

  it("error before any value: dashes and a Retry dot, never 0", async () => {
    const { source, set } = controlled(null)
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(tiles().textContent).not.toMatch(/0/)
    const retry = screen.getByRole("button", { name: ERROR_TOOLTIP })
    expect(retry).toHaveAttribute("title", ERROR_TOOLTIP)
    await set(reading(42))
    // The error was just announced: the value waits out the minute.
    await act(() => vi.advanceTimersByTimeAsync(ANNOUNCE_MIN_MS))
    expect(spoken()).toBe("Subscribers: 42, no change today")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    // The first good value after a placeholder paints settled.
    expect(document.querySelector("[data-flap]")).toBeNull()
    fireEvent.click(screen.getByRole("link"))
  })

  it("stale: keeps the last value, says when it was last updated, hides the delta chip", async () => {
    const { source, fail } = controlled(reading(1_284, 3))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await fail()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(spoken()).toBe("Subscribers: 1,284, up 3 today, Last updated 9:41 AM CDT")
    expect(screen.getByText("Last updated 9:41 AM CDT")).toHaveAttribute("title", "Tue, Oct 13 · 9:41 AM CDT")
    expect(screen.queryByText("+3")).not.toBeInTheDocument()
  })

  it("stale reads in the founder's Settings zone", async () => {
    act(() => updateSettings((s) => ({ ...s, timeZone: "America/Los_Angeles" })))
    const { source, fail } = controlled(reading(1_284, 3))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await fail()
    expect(screen.getByText("Last updated 7:41 AM PDT")).toBeInTheDocument()
    act(() => updateSettings((s) => ({ ...s, timeZone: "America/Chicago" })))
  })

  it("first paint never flaps", async () => {
    const { source } = controlled(reading(1_284))
    render(<SubscriberTicker variant="header" source={source} />)
    expect(document.querySelector("[data-flap]")).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(document.querySelector("[data-flap]")).toBeNull()
  })

  it("flaps only the changed digits, stepping through intermediates", async () => {
    const { source, set } = controlled(reading(184))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await set(reading(186, 2))
    await act(() => vi.advanceTimersByTimeAsync(0))
    // Ones: 4 → 5 (first flap), only that tile has flaps.
    const flaps = () => [...document.querySelectorAll("[data-flap]")].map((f) => f.textContent)
    expect(flaps()).toEqual(["4", "5"])
    await act(() => vi.advanceTimersByTimeAsync(FLAP_MS))
    expect(flaps()).toEqual(["5", "6"])
    await act(() => vi.advanceTimersByTimeAsync(FLAP_MS))
    expect(flaps()).toEqual([])
    expect(tiles().textContent).toBe("118866")
  })

  it("retargets after the current flap when a value arrives mid-animation", async () => {
    const { source, set } = controlled(reading(182))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await set(reading(186))
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect([...document.querySelectorAll("[data-flap]")].map((f) => f.textContent)).toEqual(["2", "3"])
    // Mid-flap the count moves to 184: 2→3 finishes, then 3→4, and it stops.
    await set(reading(184))
    await act(() => vi.advanceTimersByTimeAsync(FLAP_MS))
    expect([...document.querySelectorAll("[data-flap]")].map((f) => f.textContent)).toEqual(["3", "4"])
    await act(() => vi.advanceTimersByTimeAsync(FLAP_MS * 4))
    expect(document.querySelector("[data-flap]")).toBeNull()
    expect(tiles().textContent).toBe("118844")
  })

  it("reduced motion: no flaps, a 150ms crossfade, the number updates", async () => {
    setReducedMotion(true)
    const { source, set } = controlled(reading(184))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await set(reading(186, 2))
    expect(document.querySelector("[data-flap]")).toBeNull()
    expect(document.querySelector(".ticker-fade-in")).not.toBeNull()
    expect(document.querySelector(".ticker-fade-out")?.textContent).toBe("118844")
    await act(() => vi.advanceTimersByTimeAsync(CROSSFADE_MS))
    expect(document.querySelector(".ticker-fade-out")).toBeNull()
    expect(document.querySelector("[data-flap]")).toBeNull()
    expect(tiles().textContent).toBe("118866")
    expect(spoken()).toBe("Subscribers: 186, up 2 today")
  })

  it("dark: the Figma 31:220 tile, identical to light — no border, sheen, split, hinges", () => {
    document.documentElement.classList.add("dark")
    try {
      for (const variant of ["header", "bar"] as const) {
        const { source } = controlled(reading(1_284))
        const { unmount } = render(<SubscriberTicker variant={variant} source={source} />)
        const all = [...document.querySelectorAll<HTMLElement>("[data-tile]")]
        expect(all.length).toBeGreaterThan(0)
        for (const tile of all) {
          expect(tile.className, `${variant} tile`).not.toMatch(/(^|\s)([\w-]+:)*border(-|\s|$)/)
          expect(tile.className).toContain("bg-[#131313]")
          expect(tile.querySelector("[data-tile-part='sheen']")?.className).toContain("bg-white/5")
          expect(tile.querySelector("[data-tile-part='split']")?.className).toContain("bg-black/75")
          expect(tile.querySelectorAll("[data-tile-part='hinge']")).toHaveLength(2)
          for (const hinge of tile.querySelectorAll("[data-tile-part='hinge']")) {
            expect(hinge.className).toContain("bg-[#4d4d4d]")
          }
        }
        expect(all[0].style.borderRadius).toBe(variant === "header" ? "3px" : "2px")
        unmount()
      }
    } finally {
      document.documentElement.classList.remove("dark")
    }
  })

  it("announces at most once a minute; the tiles still move and the latest figure wins", async () => {
    const { source, set } = controlled(reading(184))
    render(<SubscriberTicker variant="header" source={source} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    // The first change is spoken straight away.
    await set(reading(185, 1))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(spoken()).toBe("Subscribers: 185, up 1 today")
    // Two more inside the minute: the tiles land, the region holds.
    await set(reading(186, 2))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    await set(reading(188, 4))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(tiles().textContent).toBe("118888")
    expect(spoken()).toBe("Subscribers: 185, up 1 today")
    // A minute after the last announcement, only the latest is spoken.
    await act(() => vi.advanceTimersByTimeAsync(ANNOUNCE_MIN_MS - 3_000 - 1))
    expect(spoken()).toBe("Subscribers: 185, up 1 today")
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(spoken()).toBe("Subscribers: 188, up 4 today")
    expect(screen.getByRole("link")).toHaveAccessibleName("Subscribers: 188, up 4 today")
  })
})

describe("SubscriberTicker breakdown (Stripe live)", () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => setStripeSummaryForTest(NOT_CONNECTED))

  const link = () => screen.getByRole("link")

  it("the total's groups are the link's accessible description; the live region speaks the total only", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    render(<SubscriberTicker variant="header" />)
    expect(link()).toHaveAccessibleName("Subscribers: 1,337, up 3 today")
    expect(link()).toHaveAccessibleDescription(
      "Stripe paying 1,110, App Store 53, Free (never paid) 174."
    )
    const id = link().getAttribute("aria-describedby")!
    expect(document.getElementById(id)).not.toBeVisible()
    expect(spoken()).toBe("Subscribers: 1,337, up 3 today")
    expect(status()).not.toHaveTextContent(/Stripe paying|App Store/)
  })

  it("App Store not connected: described honestly, and the total leaves it out", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    render(<SubscriberTicker variant="header" />)
    expect(link()).toHaveAccessibleName("Subscribers: 1,284, up 3 today")
    expect(link()).toHaveAccessibleDescription(
      "Stripe paying 1,110, App Store Not connected, Free (never paid) 174. Total excludes App Store (not connected)."
    )
  })

  it("keyboard focus opens the breakdown tooltip; Escape closes it; the link still goes to Metrics", async () => {
    setStripeSummaryForTest(liveSummary("connected"))
    const user = userEvent.setup()
    render(<SubscriberTicker variant="header" />)
    expect(screen.queryByTestId("ticker-breakdown")).toBeNull()
    await user.tab()
    expect(link()).toHaveFocus()
    const tip = await screen.findByTestId("ticker-breakdown")
    expect(tip).toHaveTextContent("Subscribers1,337")
    expect(tip).toHaveTextContent("Stripe paying1,110")
    expect(tip).toHaveTextContent("App Store53")
    expect(tip).toHaveTextContent("Free (never paid)174")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("ticker-breakdown")).toBeNull())
    expect(link()).toHaveAttribute("href", TICKER_HREF)
  })

  it("hover opens it too", async () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    const user = userEvent.setup()
    render(<SubscriberTicker variant="header" />)
    await user.hover(link())
    const tip = await screen.findByTestId("ticker-breakdown")
    expect(tip).toHaveTextContent("App StoreNot connected")
    expect(tip).toHaveTextContent("Total excludes App Store (not connected)")
  })

  it("sample or loading: no description and no tooltip", async () => {
    const user = userEvent.setup()
    render(<SubscriberTicker variant="header" />)
    expect(link()).not.toHaveAttribute("aria-describedby")
    await user.tab()
    await user.hover(link())
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByTestId("ticker-breakdown")).toBeNull()
  })
})

describe("SubscriberTicker with Stripe not connected", () => {
  beforeEach(() => vi.useRealTimers())

  it.each(["header", "bar"] as const)("%s: says Not connected, no simulated count, links to Connected data", (variant) => {
    render(<SubscriberTicker variant={variant} />)
    const ticker = screen.getByTestId("subscriber-ticker")
    expect(ticker).toHaveAttribute("data-state", "not_connected")
    expect(screen.getByTestId("not-connected")).toHaveTextContent("Not connected")
    expect(screen.queryByTestId("ticker-tiles")).toBeNull()
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings#connected-data")
    expect(screen.getByRole("link").className).toContain("min-h-11")
  })
})
