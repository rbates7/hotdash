"use client"

import * as React from "react"
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearState } from "@/components/product-roadmap/roadmap-store"

/**
 * Last line of defence for this route. The store validates every saved
 * copy and falls back to the seed on its own, so this should not fire; if
 * something still gets through, the founder can clear the browser copy and
 * try again rather than being stuck on a broken page.
 */
export default function ProductRoadmapError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[product-roadmap] render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="text-title-sm font-semibold tracking-tight">
          Product Roadmap couldn’t render
        </h1>
      </div>
      <p className="text-body text-muted-foreground">
        Something in this browser’s saved copy of the roadmap could not be read. Nothing is
        stored on a server; resetting discards the saved copy and shows the sample bets
        again.
      </p>
      {error.digest && (
        <p className="text-micro text-muted-foreground font-mono">ref {error.digest}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button
          variant="destructive"
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
