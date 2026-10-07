import { now } from "@/lib/clock"
import { MyDeskProvider } from "@/components/my-desk/my-desk-store"
import { MyDeskScreen } from "@/components/my-desk/my-desk-screen"

export const metadata = {
  title: "My Desk · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or the Today date chip and "Saved 5m ago" would be frozen at deploy time.
export const dynamic = "force-dynamic"

export default async function MyDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ shot?: string | string[] }>
}) {
  const params = await searchParams
  const shot = Array.isArray(params.shot) ? params.shot[0] : params.shot
  // Screenshot-only hooks. A real visit never sets `shot`.
  if (shot === "error") {
    throw new Error("My Desk screenshot: route error")
  }

  // The one read of the clock for this request. The provider turns it into
  // the founder's calendar day (America/Chicago) and everything below —
  // the Today chip, the scratch subtitle — derives from that, so the server
  // HTML and the client hydration agree even across midnight.
  const at = now()

  return (
    <MyDeskProvider nowMs={at.getTime()} holdHydration={shot === "loading"}>
      <MyDeskScreen />
    </MyDeskProvider>
  )
}
