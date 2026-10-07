"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  LogOutIcon,
  XIcon,
} from "lucide-react"

import { isActiveRoute, navItems } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { FounderIdentity } from "@/components/founder-identity"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
  useSidebarSurface,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export const CLOSE_DRAWER_NAME = "Close"
export const EXPAND_SIDEBAR_NAME = "Expand sidebar"
export const COLLAPSE_SIDEBAR_NAME = "Collapse sidebar"

/**
 * Deke tablet including 1180 (768–1279): 44px rows. Desktop ≥1280 keeps h-8.
 * Portrait icon-rail squares are applied on the rail container, not here,
 * so the 256 overlay can show full labels.
 */
const TABLET_ROW = "max-xl:h-11!"

/**
 * Round chevron straddling the sidebar's right edge. Visible glyph stays 24px;
 * hit area is 44×44 on tablet portrait (6:493) and at 1180 (5:363).
 */
function CollapseToggle() {
  const { state, isTabletPortrait, toggleSidebar } = useSidebar()
  const surface = useSidebarSurface()
  const collapsed =
    surface === "rail" && (isTabletPortrait || state === "collapsed")

  return (
    <Button
      data-slot="sidebar-collapse"
      variant="outline"
      size="icon-xs"
      onClick={toggleSidebar}
      className={cn(
        "bg-sidebar text-muted-foreground hover:text-foreground absolute top-4 -right-3 z-20 size-6 rounded-full border shadow-sm",
        "md:max-lg:top-1.5 md:max-lg:-right-5 md:max-lg:size-11! md:max-lg:border-0 md:max-lg:bg-transparent md:max-lg:shadow-none md:max-lg:hover:bg-transparent",
        "lg:max-xl:top-1.5 lg:max-xl:size-11!"
      )}
    >
      <span
        className={cn(
          "md:max-lg:bg-sidebar md:max-lg:text-muted-foreground md:max-lg:flex md:max-lg:size-6 md:max-lg:items-center md:max-lg:justify-center md:max-lg:rounded-full md:max-lg:border md:max-lg:shadow-sm"
        )}
      >
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </span>
      <span className="sr-only">
        {collapsed ? EXPAND_SIDEBAR_NAME : COLLAPSE_SIDEBAR_NAME}
      </span>
    </Button>
  )
}

function DrawerClose() {
  const { setOpenMobile } = useSidebar()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11! shrink-0"
      onClick={() => setOpenMobile(false)}
    >
      <XIcon aria-hidden />
      <span className="sr-only">{CLOSE_DRAWER_NAME}</span>
    </Button>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  // Route changes close the overlay. Same-page clicks are handled on the link.
  React.useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  const closeOverlay = React.useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="relative overflow-visible">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:justify-center md:max-lg:justify-center">
          <FounderIdentity />
          {isMobile ? <DrawerClose /> : <CollapseToggle />}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* The one named navigation landmark for the rail, so tests and
          assistive tech can scope to it by name instead of a data-slot. */}
      <SidebarContent>
        <nav
          aria-label="Founder dashboard"
          className="flex min-h-0 flex-1 flex-col"
        >
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active =
                    !item.external && isActiveRoute(pathname, item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        className={TABLET_ROW}
                        render={
                          item.external ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={closeOverlay}
                            />
                          ) : (
                            <Link href={item.href} onClick={closeOverlay} />
                          )
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        {/* A named region, so the theme control has a landmark of its own
            and tests can scope to it instead of searching the page. */}
        <section
          aria-label="Appearance"
          className="flex group-data-[collapsible=icon]:justify-center md:max-lg:justify-center"
        >
          <ThemeToggle />
        </section>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Help"
              className={TABLET_ROW}
            >
              <CircleQuestionMarkIcon />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              className={cn(
                "text-destructive hover:text-destructive [&_svg]:text-destructive",
                TABLET_ROW
              )}
            >
              <LogOutIcon />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
