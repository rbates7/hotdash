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
 * Round chevron straddling the sidebar's right edge. The visible control is
 * still 24px (desktop token); the hit area is 44×44 on tablet (Deke 6:493).
 */
function CollapseToggle() {
  const { state, isTablet, toggleSidebar } = useSidebar()
  const surface = useSidebarSurface()
  const collapsed =
    surface === "rail" && (isTablet || state === "collapsed")

  return (
    <Button
      data-slot="sidebar-collapse"
      variant="outline"
      size="icon-xs"
      onClick={toggleSidebar}
      className={cn(
        "bg-sidebar text-muted-foreground hover:text-foreground absolute top-4 -right-3 z-20 size-6 rounded-full border shadow-sm",
        isTablet &&
          "top-1.5 -right-5 size-11 border-0 bg-transparent shadow-none hover:bg-transparent"
      )}
    >
      <span
        className={cn(
          isTablet &&
            "bg-sidebar text-muted-foreground flex size-6 items-center justify-center rounded-full border shadow-sm"
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
      className="size-11 shrink-0"
      onClick={() => setOpenMobile(false)}
    >
      <XIcon aria-hidden />
      <span className="sr-only">{CLOSE_DRAWER_NAME}</span>
    </Button>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, isTablet, setOpenMobile } = useSidebar()

  // Overlay drawers (phone sheet + tablet expand) close after a route change
  // so the next screen is not sitting under an open drawer.
  React.useEffect(() => {
    if (isMobile || isTablet) setOpenMobile(false)
  }, [pathname, isMobile, isTablet, setOpenMobile])

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="relative">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:justify-center">
          <FounderIdentity />
          {isMobile ? <DrawerClose /> : <CollapseToggle />}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* The one named navigation landmark for the rail, so tests and
          assistive tech can scope to it by name instead of a data-slot. */}
      <SidebarContent>
        <nav aria-label="Founder dashboard" className="flex min-h-0 flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
              {navItems.map((item) => {
                const active = !item.external && isActiveRoute(pathname, item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        (isMobile || isTablet) && "h-11!",
                        "md:max-lg:group-data-[collapsible=icon]:size-11! md:max-lg:group-data-[collapsible=icon]:justify-center md:max-lg:group-data-[collapsible=icon]:[&>span]:sr-only"
                      )}
                      render={
                        item.external ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ) : (
                          <Link href={item.href} />
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
          className="flex group-data-[collapsible=icon]:justify-center"
        >
          <ThemeToggle />
        </section>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Help"
              className={cn(
                (isMobile || isTablet) && "h-11!",
                "md:max-lg:group-data-[collapsible=icon]:size-11! md:max-lg:group-data-[collapsible=icon]:justify-center md:max-lg:group-data-[collapsible=icon]:[&>span]:sr-only"
              )}
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
                (isMobile || isTablet) && "h-11!",
                "md:max-lg:group-data-[collapsible=icon]:size-11! md:max-lg:group-data-[collapsible=icon]:justify-center md:max-lg:group-data-[collapsible=icon]:[&>span]:sr-only"
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
