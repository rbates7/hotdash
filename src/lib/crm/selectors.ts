import { formatRelative } from "@/lib/clock"
import {
  CRM_CASE_STATUSES,
  CRM_PRIORITIES,
  isWaitingOnUs,
  type CrmAccount,
  type CrmCase,
  type CrmCaseStatus,
  type CrmPriority,
} from "@/lib/crm/case-view"

/**
 * Pure selectors for the CRM screens: the Cases filters and their URL
 * form, the Overview lists, and account search. Ported from crm-port's
 * `cases/age.ts` and `dashboard/server.ts` maths, run on the client.
 */

/* ------------------------------------------------------------------ age */

/** After this many days waiting on your reply, a case is overdue (crm-port's rule). */
export const OVERDUE_THRESHOLD_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export function isOverdue(c: Pick<CrmCase, "status" | "waitingOnUsSince">, nowMs: number) {
  return isWaitingOnUs(c) && c.waitingOnUsSince !== null && nowMs - Date.parse(c.waitingOnUsSince) >= OVERDUE_THRESHOLD_DAYS * DAY_MS
}

/** "now", "18m", "2h", "Yesterday", "3d". */
export function ageLabel(iso: string | null, nowMs: number) {
  if (!iso) return "—"
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? formatRelative(ms, nowMs, { style: "compact" }) : "—"
}

/** "just now", "5m ago", "2h ago", "3d ago". */
export function agoLabel(iso: string | null, nowMs: number) {
  if (!iso) return "—"
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? formatRelative(ms, nowMs) : "—"
}

/* --------------------------------------------------------- Cases filters */

export type CaseFilters = {
  q: string
  status: CrmCaseStatus | null
  priority: CrmPriority | null
  waitingOnUs: boolean
}

export const NO_FILTERS: CaseFilters = { q: "", status: null, priority: null, waitingOnUs: false }

/** Query keys. `case` (the open panel) is separate from the filters. */
export const CASE_PARAM = "case"
const KEYS = { q: "q", status: "status", priority: "priority", waitingOnUs: "waiting" } as const

type ReadParams = Pick<URLSearchParams, "get">

const pick = <T extends string>(list: readonly T[], v: string | null): T | null =>
  v !== null && (list as readonly string[]).includes(v) ? (v as T) : null

/** Filters from the URL; unknown values are ignored, never an error. */
export function parseCaseFilters(params: ReadParams): CaseFilters {
  return {
    q: (params.get(KEYS.q) ?? "").slice(0, 200),
    status: pick(CRM_CASE_STATUSES, params.get(KEYS.status)),
    priority: pick(CRM_PRIORITIES, params.get(KEYS.priority)),
    waitingOnUs: params.get(KEYS.waitingOnUs) === "1",
  }
}

/**
 * The query string after `changes`, keeping every other key (the open
 * case included). Empty values are removed so a clean list is `/crm/cases`.
 */
export function withFilters(params: URLSearchParams | string, changes: Partial<CaseFilters>): string {
  const next = new URLSearchParams(params)
  for (const [field, value] of Object.entries(changes) as [keyof CaseFilters, CaseFilters[keyof CaseFilters]][]) {
    const key = KEYS[field]
    const text = typeof value === "boolean" ? (value ? "1" : "") : (value ?? "")
    if (text) next.set(key, text)
    else next.delete(key)
  }
  return next.toString()
}

/** The query string with the panel opened on `caseId`, or closed when null. */
export function withOpenCase(params: URLSearchParams | string, caseId: string | null): string {
  const next = new URLSearchParams(params)
  if (caseId) next.set(CASE_PARAM, caseId)
  else next.delete(CASE_PARAM)
  return next.toString()
}

export function clearFilters(params: URLSearchParams | string): string {
  return withFilters(params, { q: "", status: null, priority: null, waitingOnUs: false })
}

export function hasFilters(f: CaseFilters) {
  return f.q.trim() !== "" || f.status !== null || f.priority !== null || f.waitingOnUs
}

export function matchesCase(c: CrmCase, f: CaseFilters) {
  if (f.status && c.status !== f.status) return false
  if (f.priority && c.priority !== f.priority) return false
  if (f.waitingOnUs && !isWaitingOnUs(c)) return false
  const q = f.q.trim().toLowerCase()
  if (!q) return true
  return [c.subject, c.lastMessageSnippet, c.contact.name ?? "", c.contact.email].some((s) => s.toLowerCase().includes(q))
}

export function filterCases<C extends CrmCase>(cases: readonly C[], f: CaseFilters): C[] {
  return cases.filter((c) => matchesCase(c, f))
}

/* -------------------------------------------------------------- Overview */

/** Open cases waiting on us, the longest-waiting first. */
export function oldestWaitingOnUs<C extends CrmCase>(cases: readonly C[], limit = 5): C[] {
  return cases
    .filter((c) => isWaitingOnUs(c) && c.waitingOnUsSince !== null)
    .sort((a, b) => Date.parse(a.waitingOnUsSince!) - Date.parse(b.waitingOnUsSince!))
    .slice(0, limit)
}

/* -------------------------------------------------------------- Accounts */

export function filterAccounts(accounts: readonly CrmAccount[], q: string): CrmAccount[] {
  const needle = q.trim().toLowerCase()
  const sorted = [...accounts].sort(
    (a, b) => (b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0) - (a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0) || a.name.localeCompare(b.name)
  )
  if (!needle) return sorted
  return sorted.filter((a) =>
    [a.name, a.domain ?? "", ...a.contacts.flatMap((p) => [p.name ?? "", p.email])].some((s) => s.toLowerCase().includes(needle))
  )
}

/** Account names by id, for the Cases table's Account column. */
export function accountNames(accounts: readonly CrmAccount[]): ReadonlyMap<string, string> {
  return new Map(accounts.map((a) => [a.id, a.name]))
}
