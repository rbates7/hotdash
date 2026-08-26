import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"

import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

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
          <SidebarProvider defaultOpen={sidebarOpen}>
            <AppSidebar />
            <SidebarInset>
              <main className="flex-1 p-6">{children}</main>
            </SidebarInset>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
