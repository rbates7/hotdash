import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { COMPACT_QUERY } from "@/hooks/use-mobile"
import { APP_HEADER_NAME, CLOSE_MENU_NAME, OPEN_MENU_NAME, AppHeader } from "@/components/app-header"
import { SidebarProvider } from "@/components/ui/sidebar"

const nativeMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

function mockCompact(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === COMPACT_QUERY ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function renderHeader() {
  return render(
    <SidebarProvider>
      <AppHeader />
    </SidebarProvider>
  )
}

describe("AppHeader", () => {
  it("shows the menu button and the current section label", () => {
    mockCompact(true)
    renderHeader()
    expect(screen.getByRole("banner", { name: APP_HEADER_NAME })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: OPEN_MENU_NAME })).toHaveAttribute("aria-expanded", "false")
    // setup.ts pins usePathname at /agent-workplace
    expect(screen.getByText("Agent Workplace")).toBeInTheDocument()
  })

  it("toggles aria-expanded when the menu is opened on a compact viewport", async () => {
    mockCompact(true)
    const user = userEvent.setup()
    renderHeader()
    const button = screen.getByRole("button", { name: OPEN_MENU_NAME })
    await user.click(button)
    expect(screen.getByRole("button", { name: CLOSE_MENU_NAME })).toHaveAttribute("aria-expanded", "true")
  })
})
