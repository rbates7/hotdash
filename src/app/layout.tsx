import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// Chlk coach-facing screens are set in Inter; the founder shell keeps Geist.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Chlk",
  description: "Chlk dashboards.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      // `style-nova` scopes the shadcn Nova style layer; next-themes swaps the
      // `dark` class on this element after hydration (founder routes only).
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} style-nova h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
