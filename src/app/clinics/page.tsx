import { now } from "@/lib/clock"
import { ClinicsProvider } from "@/components/clinics/clinics-store"
import { ClinicsScreen } from "@/components/clinics/clinics-screen"

export const metadata = {
  title: "Clinics · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or Upcoming/Past and every "in N days" would be frozen at deploy time.
export const dynamic = "force-dynamic"

export default function ClinicsPage() {
  // The one read of the clock for this request. The provider turns it into
  // the founder's calendar day (America/Chicago) and everything below —
  // the Upcoming/Past split, "in N days", the add dialog's default date —
  // derives from that, so the server HTML and the client hydration agree
  // even across midnight.
  const at = now()

  return (
    <ClinicsProvider nowMs={at.getTime()}>
      <ClinicsScreen />
    </ClinicsProvider>
  )
}
