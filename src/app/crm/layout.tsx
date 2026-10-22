import type { ReactNode } from "react"

import { CommandPalette } from "@/components/crm/command-palette"
import { CrmNavigation } from "@/components/crm/crm-navigation"
import { CrmToaster } from "@/components/crm/crm-toaster"
import { getDb } from "@/lib/crm/db/client"
import { countTriagePending } from "@/lib/crm/triage/server"

export const metadata = {
  title: "CRM · Chlk",
}

// Rendered per request, never at build: now() on each page must be the
// request's instant or every "2h ago" and the seed offsets would freeze
// at deploy time. The provider and shell live in the pages (CrmApp) so
// this route's error.tsx can catch a crash and remount a fresh store.
export const dynamic = "force-dynamic"

export default async function CrmLayout({ children }: { children: ReactNode }) {
  let triageCount = 0
  try {
    triageCount = await countTriagePending(getDb())
  } catch {
    // Keep CRM navigation available while Postgres is unconfigured or unavailable.
  }

  return (
    <section className="min-w-0">
      <CrmNavigation triageCount={triageCount} />
      <div className="-mx-4 md:-mx-6">{children}</div>
      <CommandPalette />
      <CrmToaster />
    </section>
  )
}
