"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { countTriagePending } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PersistenceNote } from "@/components/persistence-note"
import { SampleDataTag } from "@/components/sample-data"
import { CommandPalette } from "@/components/crm/command-palette"
import { useCrm } from "@/components/crm/crm-store"
import { CRM_RESET } from "@/components/crm/crm-touch"

export const LEDE = "Conversations, contacts, and triage — sample data until Gmail and Stripe sync"

const TABS = [
  { href: "/crm", label: "Overview", match: (path: string) => path === "/crm" },
  { href: "/crm/cases", label: "Cases", match: (path: string) => path.startsWith("/crm/cases") },
  {
    href: "/crm/contacts",
    label: "Contacts",
    match: (path: string) => path.startsWith("/crm/contacts"),
  },
  { href: "/crm/triage", label: "Triage", match: (path: string) => path.startsWith("/crm/triage") },
] as const

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const store = useCrm()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const triageCount = countTriagePending(store.messages)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
      {/* Phone (Deke 8:2): title with a 44×44 icon-only Search top-right, the
          lede, then the note, Reset and tag on their own line. */}
      <header className="flex flex-wrap items-start justify-between gap-4 max-md:justify-start max-md:gap-x-2.5">
        <div className="min-w-0 max-md:w-[calc(100%-3.375rem)] md:max-xl:min-w-52 md:max-xl:flex-1 md:max-xl:basis-0">
          <h1 className="text-display-sm font-semibold tracking-tight">CRM</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">{LEDE}</p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5 max-md:contents">
          <PersistenceNote store={store} className="max-md:order-3" resetClassName={CRM_RESET} />
          <SampleDataTag className="h-6 px-2 max-md:order-4 max-md:self-center" />
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3.5 max-xl:h-11! max-md:order-2 max-md:size-11! max-md:px-0!"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden />
            <span className="max-md:sr-only">Search</span>
            <kbd className="text-micro text-muted-foreground ml-1 rounded border px-1 font-medium max-md:hidden">
              ⌘K
            </kbd>
          </Button>
        </div>
      </header>

      <nav
        aria-label="CRM sections"
        className="bg-muted inline-flex w-fit items-center gap-0.5 rounded-lg p-0.5 max-md:flex max-md:w-full"
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // 44 tall below 1280; a full-width segmented row on a phone.
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-xl:min-h-11 max-xl:min-w-11 max-xl:px-3 max-md:flex-1 max-md:justify-center max-md:px-1",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.label === "Triage" && triageCount > 0 ? (
                <span className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 rounded-full px-1.5 text-[0.65rem] font-semibold tabular-nums">
                  {triageCount}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {children}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
