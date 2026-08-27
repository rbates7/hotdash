"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { useMounted } from "@/hooks/use-mounted"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSidebar } from "@/components/ui/sidebar"

// Nova's `.cn-toggle` sets `aria-pressed:bg-muted`, which renders the
// selected half *darker* than the unselected one; `!` overrides it.
// Keyed on aria-pressed, not data-pressed: shadcn registers custom
// variants for `data-open`/`data-active` but not `data-pressed`, so
// `data-pressed:` utilities are silently dropped at build time.
const PRESSED =
  "aria-pressed:bg-sidebar! dark:aria-pressed:bg-accent! aria-pressed:shadow-sm"

/**
 * Light/Dark switch pinned in the sidebar footer. Renders as a segmented
 * control while the sidebar is expanded and as a single icon button once it
 * collapses to the icon rail.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { state, isMobile } = useSidebar()
  // `theme` is undefined until next-themes reads storage on the client, so
  // hold a same-shape placeholder until then to avoid a hydration mismatch.
  const mounted = useMounted()

  const collapsed = state === "collapsed" && !isMobile

  if (!mounted) {
    return <div aria-hidden className={cn("h-8", collapsed ? "w-8" : "w-full")} />
  }

  if (collapsed) {
    const nextTheme = theme === "dark" ? "light" : "dark"
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-8"
        onClick={() => setTheme(nextTheme)}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        <span className="sr-only">Switch to {nextTheme} theme</span>
      </Button>
    )
  }

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      className="bg-muted w-full"
      value={[theme === "light" ? "light" : "dark"]}
      onValueChange={(value) => {
        // Single-select group: ignore the empty array when the pressed item
        // is clicked again, so a theme is always selected.
        if (value[0]) setTheme(value[0])
      }}
    >
      <ToggleGroupItem value="light" className={cn("flex-1", PRESSED)}>
        <SunIcon />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className={cn("flex-1", PRESSED)}>
        <MoonIcon />
        Dark
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
