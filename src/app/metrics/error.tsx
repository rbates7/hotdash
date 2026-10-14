"use client"

import * as React from "react"
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearState } from "@/components/metrics/metrics-store"
import { METRICS_DANGER, METRICS_ERROR_ACTIONS, METRICS_TOUCH } from "@/components/metrics/responsive"

/**
 * Last line of defence for this route. The store validates every saved
 * copy and falls back to the seed on its own, so this should not fire; if
 * something still gets through, the founder can clear the browser copy and
 * try again rather than being stuck on a broken page.
 */
export default function MetricsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[metrics] render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="text-title-sm font-semibold tracking-tight">Metrics couldn’t render</h1>
      </div>
      <p className="text-body text-muted-foreground">
        Something in this browser’s saved copy of the Metrics board could not be read.
        Nothing is stored on a server; resetting discards the saved copy and shows the
        sample data again.
      </p>
      {error.digest && (
        <p className="text-micro text-muted-foreground font-mono">ref {error.digest}</p>
      )}
      {/* Below 1280 both actions are 44px hits and stack on phone; the
          destructive label uses the readable danger token there (Nova's
          text-destructive on its own tint is ~3.4:1). Desktop is unchanged. */}
      <div className={METRICS_ERROR_ACTIONS}>
        <Button variant="outline" onClick={reset} className={METRICS_TOUCH}>
          Try again
        </Button>
        <Button
          variant="destructive"
          className={`${METRICS_DANGER} ${METRICS_TOUCH}`}
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
