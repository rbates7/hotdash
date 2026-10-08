/*
 * The in-app way back from a case or contact to the list it was opened from.
 *
 * Opening a record from its list records where you were (path + query) and
 * which record you opened. The record's breadcrumb then takes one real
 * history step back, so the browser restores the list's scroll position and
 * filters exactly as its own Back button does, and history does not grow.
 * A deep link or a fresh tab has no record, so the breadcrumb stays a plain
 * link to the list. Any other navigation clears the record (the list clears
 * it on mount; a record page clears it when you leave it for anywhere else),
 * so a stale entry can never send Back somewhere surprising.
 */

import * as React from "react"

export const CRM_RETURN_KEY = "hotdash.crm.from-list"

type ListPath = "/crm/cases" | "/crm/contacts"

type ReturnEntry = { list: ListPath; url: string; detail: string }

type ClickLike = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number }

/** A click that opens a new tab/window (or a non-primary button) leaves this page alone. */
function isModified(event: ClickLike) {
  return Boolean(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button ?? 0) !== 0)
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

function read(): ReturnEntry | null {
  try {
    const raw = storage()?.getItem(CRM_RETURN_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ReturnEntry>
    if (
      (value.list === "/crm/cases" || value.list === "/crm/contacts") &&
      typeof value.url === "string" &&
      typeof value.detail === "string"
    ) {
      return value as ReturnEntry
    }
  } catch {
    // Unreadable entry: treat as none.
  }
  return null
}

/** Forget where the last record was opened from. */
export function clearListReturn() {
  try {
    storage()?.removeItem(CRM_RETURN_KEY)
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/**
 * Call when a record is opened from its list (row link, phone sheet, tablet
 * "…"). Records the list URL as it is right now, query included. Pass the
 * click when there is one: a new-tab click records nothing, since this tab
 * stays on the list.
 */
export function rememberListReturn(detailHref: string, event?: ClickLike) {
  if (event && isModified(event)) return
  const { pathname, search } = window.location
  if (pathname !== "/crm/cases" && pathname !== "/crm/contacts") return
  try {
    storage()?.setItem(
      CRM_RETURN_KEY,
      JSON.stringify({ list: pathname, url: pathname + search, detail: detailHref } satisfies ReturnEntry)
    )
  } catch {
    // Storage unavailable: the breadcrumb falls back to its plain link.
  }
}

/**
 * On a record page: is there a recorded return to `list` for this record?
 * A record for any other page is stale and is cleared.
 */
export function hasListReturn(list: ListPath): boolean {
  const entry = read()
  if (!entry) return false
  if (entry.detail !== window.location.pathname) {
    clearListReturn()
    return false
  }
  return entry.list === list
}

/**
 * The breadcrumb's click handler. When this record was opened from `list`,
 * take one history step back (scroll and filters come back with it);
 * otherwise let the plain link navigate.
 */
export function backToList(event: ClickLike & { preventDefault: () => void }, list: ListPath, back: () => void) {
  // A modified click opens a new tab/window: leave it to the link.
  if (isModified(event)) return
  if (!hasListReturn(list)) return
  event.preventDefault()
  clearListReturn()
  back()
}

/**
 * On a record page (`detail` is its path): drop a stale record on arrival,
 * and forget this page's record once you leave it for anywhere else, so
 * coming back to it later (browser Back from another page) keeps the plain
 * link. The leave check runs after the navigation has updated the URL, so a
 * development double-mount (same URL) keeps the record.
 */
export function useListReturn(list: ListPath, detail: string) {
  React.useEffect(() => {
    hasListReturn(list)
    return () => {
      window.setTimeout(() => {
        if (window.location.pathname !== detail && read()?.detail === detail) clearListReturn()
      }, 0)
    }
  }, [list, detail])
}
