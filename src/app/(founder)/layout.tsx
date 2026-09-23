import type { Metadata } from "next"
import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata: Metadata = {
  title: "Chlk Founder Dashboard",
  description: "Founder dashboard for Chlk.",
}

export default async function FounderLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The sidebar persists its open state in a cookie; read it here so the
  // first paint already matches, instead of flashing open then collapsing.
  const sidebarOpen =
    (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <ThemeProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar />
        {/* SidebarInset already renders the <main> landmark. It also sets
            w-full, which beside a sibling rail resolves wider than the space
            actually left — min-w-0 lets it shrink so wide content scrolls
            inside the page instead of off the edge. */}
        <SidebarInset className="min-w-0 p-6">{children}</SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}
