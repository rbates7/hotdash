"use client"

import * as React from "react"

import {
  ACCOUNTS_PATH,
  parseAccountDetail,
  parseAccounts,
  type AccountDetailResponse,
  type AccountsResponse,
  type AccountsStatus,
} from "@/lib/crm/accounts/model"
import { CONNECTING_POLL_MS } from "@/hooks/use-stripe-summary"

/**
 * The browser's copy of `/api/crm/accounts` (or one organization's), read
 * on mount and kept fresh:
 *
 * - **loading** until the first answer: skeletons, never rows that swap;
 * - **ready**: `connecting` polls every `CONNECTING_POLL_MS`, everything
 *   else every `ACCOUNTS_POLL_MS` (the server caches about five minutes);
 * - **unauthorized** on the login gate's 401: "Your session expired",
 *   never "Not connected". Polling stops;
 * - **not_found** on the detail route's 404 (no such organization);
 * - a failed or unreadable read keeps the last rows as `stale`; with none
 *   yet it reads as not connected.
 */

export const ACCOUNTS_POLL_MS = 5 * 60_000

type WithStatus = { status: AccountsStatus }

export type AccountsView<T> = { phase: "loading" } | { phase: "unauthorized" } | { phase: "not_found" } | { phase: "ready"; data: T }

export type AccountsFetch<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "error" }

export async function fetchAccountsJson<T>(path: string, parse: (v: unknown) => T | null): Promise<AccountsFetch<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" })
    if (res.status === 401) return { kind: "unauthorized" }
    if (res.status === 404) return { kind: "not_found" }
    if (!res.ok) return { kind: "error" }
    const data = parse(await res.json())
    return data ? { kind: "ok", data } : { kind: "error" }
  } catch {
    return { kind: "error" }
  }
}

export function accountsReducer<T extends WithStatus>(
  view: AccountsView<T>,
  result: AccountsFetch<T>,
  notConnected: T
): AccountsView<T> {
  if (result.kind === "ok") return { phase: "ready", data: result.data }
  if (result.kind === "unauthorized") return { phase: "unauthorized" }
  if (result.kind === "not_found") return { phase: "not_found" }
  if (view.phase === "ready" && (view.data.status === "connected" || view.data.status === "stale")) {
    return { phase: "ready", data: { ...view.data, status: "stale" } }
  }
  return { phase: "ready", data: notConnected }
}

function useAccountsSource<T extends WithStatus>(path: string, parse: (v: unknown) => T | null, notConnected: T) {
  const [view, setView] = React.useState<AccountsView<T>>({ phase: "loading" })
  React.useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let state: AccountsView<T> = { phase: "loading" }
    const read = async () => {
      const result = await fetchAccountsJson(path, parse)
      if (!alive) return
      state = accountsReducer(state, result, notConnected)
      setView(state)
      if (state.phase !== "ready") return
      timer = setTimeout(read, state.data.status === "connecting" ? CONNECTING_POLL_MS : ACCOUNTS_POLL_MS)
    }
    void read()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [path, parse, notConnected])
  return view
}

const NOT_CONNECTED_LIST: AccountsResponse = {
  status: "not_connected",
  missing: [],
  lastSyncedAt: null,
  lastTriedAt: null,
  stripeContacts: 0,
  orgs: [],
  noOrgUsers: [],
}

const NOT_CONNECTED_DETAIL: AccountDetailResponse = {
  status: "not_connected",
  missing: [],
  lastSyncedAt: null,
  lastTriedAt: null,
  org: null,
}

export function useCrmAccounts() {
  return useAccountsSource(ACCOUNTS_PATH, parseAccounts, NOT_CONNECTED_LIST)
}

export function useCrmAccount(orgId: string) {
  return useAccountsSource(`${ACCOUNTS_PATH}/${encodeURIComponent(orgId)}`, parseAccountDetail, NOT_CONNECTED_DETAIL)
}
