"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * Builds the URL for a change to the current list's filters. Every list
 * keeps its state in the query string, so a filtered, sorted page is a link
 * you can bookmark, share or reload. An empty value removes the key, and
 * any change starts again at page one.
 */
export function useListUrl() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      params.delete("offset")
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams]
  )
}
