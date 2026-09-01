import { CommandPalette } from "@/components/crm/command-palette"
import { CrmTabs } from "@/components/crm/crm-tabs"
import { CustomerSearch } from "@/components/crm/customer-search"
import { Toaster } from "@/components/ui/sonner"
import { getDb } from "@/lib/crm/db/client"
import { countTriagePending } from "@/lib/crm/triage/server"

export const metadata = {
  title: "CRM · Chlk",
}

export default function CrmLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let triageCount = 0
  try {
    triageCount = countTriagePending(getDb())
  } catch {
    // The shell still renders before the database exists (pnpm crm:seed).
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title-lg font-semibold">CRM</h1>
        <CustomerSearch />
      </div>
      <CrmTabs triageCount={triageCount} />
      {children}
      <CommandPalette />
      <Toaster />
    </div>
  )
}
