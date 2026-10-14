"use client"

import * as React from "react"
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearState } from "@/components/agent-workplace/issues-store"

/**
 * Last line of defence for this route. Bugs reads the Workplace store, so
 * a broken saved copy is the Workplace board's. The store validates every
 * copy and falls back to the seed on its own, so this should not fire; if
 * something still gets through, the founder can clear that shared browser
 * copy and try again rather than being stuck on a broken page.
 */
export default function BugsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[bugs] render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="text-title-sm font-semibold tracking-tight">Bugs couldn’t render</h1>
      </div>
      <p className="text-body text-muted-foreground">
        Something in this browser’s saved copy of the board could not be read.
        Nothing is stored on a server; resetting clears the Agent Workplace
        board’s saved copy (they share a key) and shows the sample data again.
      </p>
      {error.digest && (
        <p className="text-micro text-muted-foreground font-mono">ref {error.digest}</p>
      )}
      {/* Below 1280 both actions are 44px hits and stack on phone; the
          destructive label uses the readable danger token there (Nova's
          text-destructive on its own tint is ~3.4:1). Desktop is unchanged. */}
      <div className="flex gap-2 max-md:flex-col">
        <Button variant="outline" onClick={reset} className="max-xl:h-11!">
          Try again
        </Button>
        <Button
          variant="destructive"
          className="max-xl:text-danger-text! max-xl:h-11!"
          onClick={() => {
            clearState(window.localStorage)
            reset()
          }}
        >
          <RotateCcwIcon aria-hidden />
          Reset and clear saved copy
        </Button>
      </div>
    </div>
  )
}
