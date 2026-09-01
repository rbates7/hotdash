"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FireIcon,
  GearSixIcon,
  SquaresFourIcon,
  TrayIcon,
  UsersIcon,
  type Icon,
} from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: Icon
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: SquaresFourIcon },
  { href: "/cases", label: "Cases", icon: TrayIcon },
  { href: "/contacts", label: "Contacts", icon: UsersIcon },
  { href: "/triage", label: "Triage", icon: FireIcon },
  { href: "/settings", label: "Settings", icon: GearSixIcon },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground max-lg:w-14">
      <div className="flex h-14 items-center gap-2 px-4 max-lg:justify-center max-lg:px-0">
        <FireIcon weight="fill" className="size-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight max-lg:hidden">
          hotdash
        </span>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-lg:justify-center max-lg:px-0",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <item.icon
                weight={active ? "fill" : "regular"}
                className="size-4 shrink-0"
              />
              <span className="max-lg:hidden">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-3 text-[0.65rem] text-muted-foreground/60 max-lg:hidden">
        Chlk founder ops
      </div>
    </aside>
  )
}
