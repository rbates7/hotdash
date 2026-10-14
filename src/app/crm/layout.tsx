import type { ReactNode } from "react"

export const metadata = {
  title: "CRM · Chlk",
}

// Rendered per request, never at build: now() on each page must be the
// request's instant or every "2h ago" and the seed offsets would freeze
// at deploy time. The provider and shell live in the pages (CrmApp) so
// this route's error.tsx can catch a crash and remount a fresh store.
export const dynamic = "force-dynamic"

export default function CrmLayout({ children }: { children: ReactNode }) {
  return children
}
