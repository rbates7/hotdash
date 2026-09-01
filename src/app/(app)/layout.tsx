import { AppSidebar } from "@/components/app-sidebar"
import { getDb } from "@/lib/db/client"
import { countTriagePending } from "@/lib/triage/server"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  let triageCount = 0
  try {
    triageCount = countTriagePending(getDb())
  } catch {
    // Layout must render even if the database isn't reachable yet.
  }
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar triageCount={triageCount} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
