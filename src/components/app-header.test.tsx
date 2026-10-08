import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FOUNDER_NAME, FOUNDER_ROLE } from "@/components/founder-identity"
import { PHONE_QUERY } from "@/hooks/use-mobile"
import { APP_HEADER_NAME, CLOSE_MENU_NAME, OPEN_MENU_NAME, AppHeader } from "@/components/app-header"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarProvider } from "@/components/ui/sidebar"

const nativeMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

function mockPhone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === PHONE_QUERY ? matches : false,
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
    <ThemeProvider>
      <SidebarProvider>
        <AppHeader />
      </SidebarProvider>
    </ThemeProvider>
  )
}

describe("AppHeader", () => {
  it("shows the menu button and founder identity, not the page title", () => {
    mockPhone(true)
    renderHeader()
    expect(screen.getByRole("region", { name: APP_HEADER_NAME })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: OPEN_MENU_NAME })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText(FOUNDER_ROLE)).toBeInTheDocument()
    expect(screen.getByText(FOUNDER_NAME)).toBeInTheDocument()
    expect(screen.queryByText("Agent Workplace")).not.toBeInTheDocument()
  })

  it("toggles aria-expanded when the menu is opened on a phone viewport", async () => {
    mockPhone(true)
    const user = userEvent.setup()
    renderHeader()
    const button = screen.getByRole("button", { name: OPEN_MENU_NAME })
    await user.click(button)
    expect(screen.getByRole("button", { name: CLOSE_MENU_NAME })).toHaveAttribute("aria-expanded", "true")
  })
})
