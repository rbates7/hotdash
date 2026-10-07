"use client"

import * as React from "react"
import { AlertTriangleIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react"

import { SENTRY_HREF } from "@/lib/system-status"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * Last line of defence for this route. The page is pure — nothing is read
 * from the browser, nothing is saved — so this should not fire; if it
 * does, the founder can re-render, or go straight to Sentry, which is
 * where the real errors live anyway.
 */
export default function SystemStatusError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[system-status] render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 mx-auto mt-10 flex max-w-lg flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-destructive size-5" aria-hidden />
        <h1 className="text-title-sm font-semibold tracking-tight">System Status couldn’t render</h1>
      </div>
      <p className="text-body text-muted-foreground">
        The health page itself failed to draw. Nothing is stored for this screen, so there
        is nothing to clear; try again, or open Sentry directly.
      </p>
      {error.digest && (
        <p className="text-micro text-muted-foreground font-mono">ref {error.digest}</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>
          <RotateCcwIcon aria-hidden />
          Try again
        </Button>
        <a
          href={SENTRY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost" })}
        >
          Open Sentry
          <ExternalLinkIcon aria-hidden />
        </a>
      </div>
    </div>
  )
}
