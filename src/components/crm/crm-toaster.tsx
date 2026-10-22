"use client"

import { useTheme } from "next-themes"
import { Toaster } from "sonner"

export function CrmToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          borderColor: "var(--border)",
        },
      }}
    />
  )
}
