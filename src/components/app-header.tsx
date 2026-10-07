"use client"

import { MenuIcon } from "lucide-react"
import { usePathname } from "next/navigation"

import { navLabelFor } from "@/lib/nav"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

export const OPEN_MENU_NAME = "Open menu"
export const CLOSE_MENU_NAME = "Close menu"
export const APP_HEADER_NAME = "Section"

/**
 * Compact chrome only — hidden from `lg` up so 1440×900 stays the rail.
 * Menu button is 44×44 and drives the existing sidebar sheet.
 */
export function AppHeader() {
  const pathname = usePathname()
  const { openMobile, toggleSidebar } = useSidebar()
  const title = navLabelFor(pathname)

  return (
    <header
      data-slot="app-header"
      aria-label={APP_HEADER_NAME}
      className="bg-background sticky top-0 z-20 -mx-4 mb-4 flex h-12 items-center gap-1 border-b px-2 lg:hidden"
    >
      <Button
        type="button"
        data-slot="sidebar-trigger"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-expanded={openMobile}
        aria-controls="founder-nav-drawer"
        onClick={toggleSidebar}
      >
        <MenuIcon aria-hidden />
        <span className="sr-only">{openMobile ? CLOSE_MENU_NAME : OPEN_MENU_NAME}</span>
      </Button>
      <p className="text-title-sm min-w-0 truncate font-semibold tracking-tight">{title}</p>
    </header>
  )
}
