"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  LogOutIcon,
} from "lucide-react"

import { isActiveRoute, navItems } from "@/lib/nav"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * Round chevron straddling the sidebar's right edge. Replaces the stock
 * `SidebarTrigger`, whose panel icon and inline placement don't match the
 * design.
 */
function CollapseToggle() {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"

  return (
    <Button
      variant="outline"
      size="icon-xs"
      onClick={toggleSidebar}
      className="bg-sidebar text-muted-foreground hover:text-foreground absolute top-4 -right-3 z-20 size-6 rounded-full border shadow-sm"
    >
      {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      <span className="sr-only">
        {collapsed ? "Expand sidebar" : "Collapse sidebar"}
      </span>
    </Button>
  )
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="relative">
        <div className="flex items-center gap-2 p-1">
          <Avatar className="size-8 shrink-0">
            {/* `!` beats Nova's `.cn-avatar-fallback` muted default. */}
            <AvatarFallback className="bg-brand! text-brand-foreground! text-xs font-semibold">
              RB
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-muted-foreground text-[0.625rem] font-medium tracking-widest uppercase">
              Founder
            </span>
            <span className="truncate text-sm font-semibold">Rashad Bates</span>
          </div>
        </div>
        <CollapseToggle />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
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
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <div className="flex group-data-[collapsible=icon]:justify-center">
          <ThemeToggle />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Help">
              <CircleQuestionMarkIcon />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              className="text-destructive hover:text-destructive [&_svg]:text-destructive"
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
