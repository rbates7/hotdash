"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { useMounted } from "@/hooks/use-mounted"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSidebar, useSidebarSurface } from "@/components/ui/sidebar"

// Nova's `.cn-toggle` sets `aria-pressed:bg-muted`, which renders the
// selected half *darker* than the unselected one; `!` overrides it.
// Keyed on aria-pressed, not data-pressed: shadcn registers custom
// variants for `data-open`/`data-active` but not `data-pressed`, so
// `data-pressed:` utilities are silently dropped at build time.
const PRESSED =
  "aria-pressed:bg-sidebar! dark:aria-pressed:bg-accent! aria-pressed:shadow-sm"

/**
 * Light/Dark switch. Icon on the phone top bar and collapsed rails;
 * segmented Light/Dark in the expanded rail and overlay drawers.
 */
export function ThemeToggle({
  appearance = "auto",
  className,
}: {
  appearance?: "auto" | "icon" | "segmented"
  className?: string
}) {
  const { theme, setTheme } = useTheme()
  const { state, isMobile, isTabletPortrait } = useSidebar()
  const surface = useSidebarSurface()
  const mounted = useMounted()

  const collapsedRail =
    appearance === "icon" ||
    (appearance === "auto" &&
      surface === "rail" &&
      (isTabletPortrait || state === "collapsed") &&
      !isMobile)

  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn(
          "h-8",
          collapsedRail ? "w-8" : "w-full",
          "md:max-lg:size-11 md:max-lg:w-11",
          className
        )}
      />
    )
  }

  if (collapsedRail) {
    const nextTheme = theme === "dark" ? "light" : "dark"
    const touch = isTabletPortrait || appearance === "icon"
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(touch ? "size-11" : "size-8", className)}
        onClick={() => setTheme(nextTheme)}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        <span className="sr-only">Switch to {nextTheme} theme</span>
      </Button>
    )
  }

  return (
    <ToggleGroup
      aria-label="Theme"
      variant="outline"
      spacing={0}
      className={cn("bg-muted w-full", className)}
      value={[theme === "light" ? "light" : "dark"]}
      onValueChange={(value) => {
        // Single-select group: ignore the empty array when the pressed item
        // is clicked again, so a theme is always selected.
        if (value[0]) setTheme(value[0])
      }}
    >
      <ToggleGroupItem value="light" className={cn("max-xl:h-11! flex-1", PRESSED)}>
        <SunIcon />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className={cn("max-xl:h-11! flex-1", PRESSED)}>
        <MoonIcon />
        Dark
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
