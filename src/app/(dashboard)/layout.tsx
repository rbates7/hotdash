import { cookies } from "next/headers"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/**
 * The signed-in shell: every sidebar route sits in this group. The group adds
 * no URL segment, so /home is still /home.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The sidebar persists its open state in a cookie; read it here so the
  // first paint already matches, instead of flashing open then collapsing.
  const sidebarOpen =
    (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar />
      {/* SidebarInset already renders the <main> landmark. It also sets
          w-full, which beside a sibling rail resolves wider than the space
          actually left — min-w-0 lets it shrink so wide content scrolls
          inside the page instead of off the edge. */}
      <SidebarInset className="min-w-0 p-4 md:p-6">
        <AppHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
