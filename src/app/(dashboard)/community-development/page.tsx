import { now } from "@/lib/clock"
import { PREVIEW_PARAM } from "@/lib/community-development"
import { CommunityDevelopmentProvider } from "@/components/community-development/community-development-store"
import { CommunityDevelopmentScreen } from "@/components/community-development/community-development-screen"

export const metadata = {
  title: "Community Development · Chlk",
}

// Rendered per request, never at build: now() must be the request's instant
// or the 30-day window, "done this year" and every "in N days" would be
// frozen at deploy time.
export const dynamic = "force-dynamic"

export default async function CommunityDevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const requested = (await searchParams)[PREVIEW_PARAM]
  // Review-only: `?preview=error` trips the route error.tsx so screenshots
  // can capture it. Nothing in the product UI links here.
  if (requested === "error") {
    throw new Error("Community Development preview error")
  }

  // The one read of the clock for this request. The provider turns it into
  // the founder's calendar day (America/Chicago) and everything below —
  // the 30-day window, "done this year", the add dialog's default date —
  // derives from that, so the server HTML and the client hydration agree
  // even across midnight.
  const at = now()

  return (
    <CommunityDevelopmentProvider nowMs={at.getTime()} holdHydration={requested === "skeleton"}>
      <CommunityDevelopmentScreen />
    </CommunityDevelopmentProvider>
  )
}
