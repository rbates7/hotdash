import { now } from "@/lib/clock"
import { CrmProvider } from "@/components/crm/crm-store"
import { CrmShell } from "@/components/crm/crm-shell"

export const metadata = {
  title: "CRM · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or every "2h ago" and the seed offsets would freeze at deploy time.
export const dynamic = "force-dynamic"

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const at = now()

  return (
    <CrmProvider nowMs={at.getTime()}>
      <CrmShell>{children}</CrmShell>
    </CrmProvider>
  )
}
