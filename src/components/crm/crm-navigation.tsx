"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ContactIcon,
  FlameIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const items = [
  { href: "/crm", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/crm/cases", label: "Cases", icon: InboxIcon },
  { href: "/crm/contacts", label: "Contacts", icon: ContactIcon },
  { href: "/crm/triage", label: "Triage", icon: FlameIcon },
  { href: "/crm/settings", label: "Settings", icon: SettingsIcon },
]

function isActive(pathname: string, href: string) {
  if (href === "/crm") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function CrmNavigation({ triageCount = 0 }: { triageCount?: number }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="CRM"
      className="mb-4 flex min-w-0 gap-1 overflow-x-auto rounded-xl border bg-card p-1"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            <span>{item.label}</span>
            {item.href === "/crm/triage" && triageCount > 0 ? (
              <span className="rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning-text tabular-nums">
                {triageCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
