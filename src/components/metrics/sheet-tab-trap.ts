"use client"

import * as React from "react"

/**
 * Base UI wraps Tab at a sheet's ends through a focus guard and rAF, so
 * Playwright can sample focus outside the popup (FR #30 / Sales #29). Own
 * the cycle synchronously. Metrics-local — do not lift into shared UI.
 */
function tabbablesIn(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]")
  ).filter((el) => {
    if (el === root) return false
    if (el.closest("[data-base-ui-focus-guard]")) return false
    if ("disabled" in el && (el as HTMLButtonElement).disabled) return false
    if (el.tabIndex < 0) return false
    if (el.getAttribute("aria-hidden") === "true") return false
    const r = el.getClientRects()
    return r.length > 0 && r[0]!.width > 0 && r[0]!.height > 0
  })
}

function wrapTabAt(root: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return
  const tabbable = tabbablesIn(root)
  if (tabbable.length === 0) return
  const current = document.activeElement
  const idx = current instanceof HTMLElement ? tabbable.indexOf(current) : -1
  const target = event.shiftKey
    ? tabbable[idx <= 0 ? tabbable.length - 1 : idx - 1]
    : tabbable[idx === -1 || idx === tabbable.length - 1 ? 0 : idx + 1]
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
  target.focus()
}

function visibleMetricsSheet() {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-slot='sheet-content']")).find((el) => {
      const r = el.getClientRects()
      return r.length > 0 && r[0]!.width > 0 && r[0]!.height > 0
    }) ?? null
  )
}

export function useMetricsSheetTabTrap(open: boolean) {
  React.useLayoutEffect(() => {
    if (!open) return
    const root = () => visibleMetricsSheet()
    const onKey = (event: KeyboardEvent) => {
      const el = root()
      if (el) wrapTabAt(el, event)
    }
    const onFocusIn = (event: FocusEvent) => {
      const el = root()
      const next = event.target
      if (!el || !(next instanceof Node) || el.contains(next)) return
      const list = tabbablesIn(el)
      if (list.length === 0) return
      list[0]!.focus()
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("focusin", onFocusIn, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("focusin", onFocusIn, true)
    }
  }, [open])
}
