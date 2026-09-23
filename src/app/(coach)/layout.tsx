import type { Metadata } from "next"

import { CoachSidebar } from "@/components/chlk/coach-sidebar"
import { CoachingToolbox } from "@/components/chlk/coaching-toolbox"

export const metadata: Metadata = {
  title: "Chlk — Coaching Toolbox",
  description: "Local preview of the Chlk coach dashboard.",
}

/**
 * Coach-facing shell (Figma: "Landscape Dashboard / RECENTS", 1024×768).
 * Sidebar and the Coaching Toolbox band are fixed; the route swaps the lower
 * band. Everything is mock data — this is a local-only preview.
 */
export default function CoachLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex h-dvh min-w-[1024px] bg-[#151515] font-chlk">
      <CoachSidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <CoachingToolbox />
        {children}
      </main>
    </div>
  )
}
