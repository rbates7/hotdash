"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TriangleAlertIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

type CrmTab = {
  href: string
  label: string
  icon: LucideIcon
}

const TABS: CrmTab[] = [
  { href: "/crm", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/crm/cases", label: "Cases", icon: InboxIcon },
  { href: "/crm/customers", label: "Customers", icon: UsersIcon },
  { href: "/crm/triage", label: "Triage", icon: TriangleAlertIcon },
  { href: "/crm/settings", label: "Settings", icon: SettingsIcon },
]

/**
 * Sub-navigation for the CRM. Real routes rather than tab state, so every
 * view is linkable and the back button steps through them; styled to match
 * the line tabs used in Agent Workplace.
 */
export function CrmTabs({ triageCount }: { triageCount: number }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="CRM sections"
      className="flex w-full items-center gap-1 overflow-x-auto border-b"
    >
      {TABS.map((tab) => {
        // Only Overview is an exact match; the rest own their subtrees.
        const active =
          tab.href === "/crm"
            ? pathname === "/crm"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-body -mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 whitespace-nowrap transition-colors",
              active
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
            {tab.href === "/crm/triage" && triageCount > 0 ? (
              <span className="bg-warning/15 text-warning ml-0.5 rounded-full px-1.5 text-xs font-semibold tabular-nums">
                {triageCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
