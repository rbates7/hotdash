"use client"

import { MenuIcon } from "lucide-react"

import { FounderIdentity } from "@/components/founder-identity"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export const OPEN_MENU_NAME = "Open menu"
export const CLOSE_MENU_NAME = "Close menu"
export const APP_HEADER_NAME = "Founder"

/**
 * Phone top bar (Deke 7:440 / 6:3). Hidden from `md` (768) up so tablet
 * 820 uses the icon rail and 1440 keeps the existing desktop chrome.
 * Menu 44 opens the 288 sheet; page h1 stays in the screen content.
 */
export function AppHeader() {
  const { openMobile, toggleSidebar } = useSidebar()

  return (
    <div
      data-slot="app-header"
      role="region"
      aria-label={APP_HEADER_NAME}
      className="bg-background sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex h-14 items-center gap-1 border-b pl-1 pr-1.5 md:hidden"
    >
      <Button
        type="button"
        data-slot="sidebar-trigger"
        variant="ghost"
        size="icon"
        className="size-11!"
        aria-expanded={openMobile}
        aria-controls="founder-nav-drawer"
        onClick={toggleSidebar}
      >
        <MenuIcon aria-hidden />
        <span className="sr-only">{openMobile ? CLOSE_MENU_NAME : OPEN_MENU_NAME}</span>
      </Button>
      <FounderIdentity />
      <ThemeToggle appearance="icon" className="size-11!" />
    </div>
  )
}
