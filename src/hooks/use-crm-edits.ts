"use client"

import * as React from "react"

import {
  LOCAL_EDITS_KEY,
  applyEdit,
  localEditsStorage,
  parseLocalEdits,
  type LocalEdits,
} from "@/lib/crm/local-edits"
import type { CrmCase, CrmCaseStatus, CrmPriority } from "@/lib/crm/case-view"

/**
 * This browser's case edits (`@/lib/crm/local-edits`), shared by the Cases
 * table, the case panel and the Overview so a change shows everywhere at
 * once, and in other tabs through the `storage` event.
 */

const EMPTY: LocalEdits = {}
const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cached: LocalEdits = EMPTY

function storage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** Re-read on every call, but hand back the same object while the raw copy is unchanged. */
function getSnapshot(): LocalEdits {
  let raw: string | null = null
  try {
    raw = storage()?.getItem(LOCAL_EDITS_KEY) ?? null
  } catch {
    raw = null
  }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  let parsed: LocalEdits | null = null
  try {
    parsed = raw ? parseLocalEdits(JSON.parse(raw)) : null
  } catch {
    parsed = null
  }
  cached = parsed ?? EMPTY
  return cached
}

const getServerSnapshot = () => EMPTY

function subscribe(listener: () => void) {
  listeners.add(listener)
  const offOtherTabs = localEditsStorage.subscribe(() => listener())
  return () => {
    listeners.delete(listener)
    offOtherTabs()
  }
}

/** Save `change` for `live`; false when the browser would not keep it. */
export function saveCaseEdit(
  live: Pick<CrmCase, "id" | "status" | "priority">,
  change: { status: CrmCaseStatus } | { priority: CrmPriority }
) {
  const next = applyEdit(getSnapshot(), live, change, new Date().toISOString())
  const ok = localEditsStorage.save(storage(), next)
  for (const l of listeners) l()
  return ok
}

/** Drop every case edit in this browser (the header menu's Clear my entries). */
export function clearCaseEdits() {
  localEditsStorage.clear(storage())
  for (const l of listeners) l()
}

export function useCrmEdits(): LocalEdits {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
