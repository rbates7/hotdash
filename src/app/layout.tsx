import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { BARE_HEADER } from "@/lib/gate/paths"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Chlk Founder Dashboard",
  description: "Founder dashboard for Chlk.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The sidebar persists its open state in a cookie; read it here so the
  // first paint already matches, instead of flashing open then collapsing.
  const sidebarOpen =
    (await cookies()).get("sidebar_state")?.value !== "false"
  // The login gate's /unlock page renders without the sidebar and header, so
  // nothing of the dashboard shows before sign-in (src/proxy.ts sets this).
  const isBare = (await headers()).get(BARE_HEADER) === "1"

  return (
    <html
      lang="en"
      // `style-nova` scopes the shadcn Nova style layer; next-themes swaps the
      // `dark` class on this element after hydration.
      className={`${geistSans.variable} ${geistMono.variable} style-nova h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider>
          {isBare ? (
            children
          ) : (
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
          )}
        </ThemeProvider>
      </body>
    </html>
  )
}
