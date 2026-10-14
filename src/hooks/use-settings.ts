"use client"

import * as React from "react"

import type { Storage } from "@/lib/persistence"
import { DEFAULT_SETTINGS, settingsStorage, type Settings } from "@/lib/settings"

/**
 * The founder's settings as one tiny external store, shared by Settings,
 * the sidebar and the sample-data surfaces.
 *
 * - **SSR safe.** The server snapshot (and the first client render, so
 *   hydration matches) is `DEFAULT_SETTINGS`; the browser's copy takes over
 *   straight after.
 * - **Writes only on a real change**, through `settingsStorage.save`, which
 *   skips identical copies and parks a corrupt one first. Loading never
 *   writes.
 * - **Other tabs are heard** through `settingsStorage.subscribe`; a cleared
 *   key in another tab falls back to the defaults here.
 */
export type SettingsSnapshot = {
  settings: Settings
  /** The key holds a copy (from this session or an earlier one). */
  saved: boolean
  /** The last write failed (quota, private mode); the change is not saved. */
  saveFailed: boolean
}

const SERVER_SNAPSHOT: SettingsSnapshot = {
  settings: DEFAULT_SETTINGS,
  saved: false,
  saveFailed: false,
}

let snapshot: SettingsSnapshot | null = null
let stopListening: (() => void) | null = null
const listeners = new Set<() => void>()

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    // Some sandboxed frames throw on the property access itself.
    return undefined
  }
}

function fromStorage(): SettingsSnapshot {
  const result = settingsStorage.load(browserStorage())
  return {
    settings: result.state ?? DEFAULT_SETTINGS,
    saved: result.state !== null,
    saveFailed: false,
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function getSnapshot() {
  snapshot ??= fromStorage()
  return snapshot
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  stopListening ??= settingsStorage.subscribe((result) => {
    snapshot = {
      settings: result.state ?? DEFAULT_SETTINGS,
      saved: result.state !== null,
      saveFailed: false,
    }
    emit()
  })
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopListening?.()
      stopListening = null
      // Re-read on the next subscriber; nothing stale outlives the page.
      snapshot = null
    }
  }
}

/** Apply `update` and save it. Returning the same object is a no-op (no write). */
export function updateSettings(update: (settings: Settings) => Settings) {
  const current = getSnapshot()
  const next = update(current.settings)
  if (next === current.settings) return
  const ok = settingsStorage.save(browserStorage(), next)
  snapshot = { settings: next, saved: ok || current.saved, saveFailed: !ok }
  emit()
}

export function useSettingsSnapshot(): SettingsSnapshot {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useSettings(): Settings {
  return useSettingsSnapshot().settings
}
