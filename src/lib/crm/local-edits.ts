import { createStorage, isIsoInstant, type Storage } from "@/lib/persistence"
import {
  CRM_CASE_STATUSES,
  CRM_PRIORITIES,
  isOpenCrmCase,
  isWaitingOnUs,
  type CrmCase,
  type CrmCaseStatus,
  type CrmCounts,
  type CrmPriority,
} from "@/lib/crm/types.ours"

/**
 * Status and priority changes made on the Cases screen. Gmail is read-only
 * and there is no database, so they live in this browser's localStorage,
 * keyed by case id, and are laid over the live rows on every read.
 *
 * Each edit remembers the live value it replaced (`from`). Once the live
 * row moves on by itself (Hill's write-back, or the inbox changing), the
 * edit no longer applies: the newer live value wins.
 */

export const LOCAL_EDITS_KEY = "hotdash.crm.case-edits.v1"

export type FieldEdit<T> = { value: T; from: T }

export type CaseEdit = {
  status?: FieldEdit<CrmCaseStatus>
  priority?: FieldEdit<CrmPriority>
  at: string
}

export type LocalEdits = Record<string, CaseEdit>

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v)

function parseField<T extends string>(list: readonly T[], v: unknown): FieldEdit<T> | undefined | null {
  if (v === undefined) return undefined
  if (!v || typeof v !== "object") return null
  const f = v as Record<string, unknown>
  return oneOf(list, f.value) && oneOf(list, f.from) ? { value: f.value, from: f.from } : null
}

/** Unknown fields are stripped; a malformed entry drops only itself. */
export function parseLocalEdits(value: unknown): LocalEdits | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const out: LocalEdits = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue
    const e = raw as Record<string, unknown>
    const status = parseField(CRM_CASE_STATUSES, e.status)
    const priority = parseField(CRM_PRIORITIES, e.priority)
    if (status === null || priority === null || !isIsoInstant(e.at)) continue
    if (!status && !priority) continue
    out[id] = { ...(status ? { status } : {}), ...(priority ? { priority } : {}), at: e.at }
  }
  return out
}

export const localEditsStorage = createStorage<LocalEdits>({ key: LOCAL_EDITS_KEY, parse: parseLocalEdits })

export function loadLocalEdits(storage: Storage | undefined): LocalEdits {
  return localEditsStorage.load(storage).state ?? {}
}

/**
 * Record a change to `field` on `live` (the row as the server has it).
 * Setting it back to the live value removes that part of the edit.
 */
export function applyEdit(
  edits: LocalEdits,
  live: Pick<CrmCase, "id" | "status" | "priority">,
  change: { status: CrmCaseStatus } | { priority: CrmPriority },
  at: string
): LocalEdits {
  const prev = edits[live.id]
  const next: CaseEdit = { ...prev, at }
  if ("status" in change) {
    if (change.status === live.status) delete next.status
    else next.status = { value: change.status, from: live.status }
  } else {
    if (change.priority === live.priority) delete next.priority
    else next.priority = { value: change.priority, from: live.priority }
  }
  const rest = { ...edits }
  delete rest[live.id]
  return next.status || next.priority ? { ...rest, [live.id]: next } : rest
}

/** The case as this browser shows it: the edit wins while the live value is the one it replaced. */
export function mergeCase<C extends CrmCase>(live: C, edit: CaseEdit | undefined): C {
  if (!edit) return live
  const status = edit.status && edit.status.from === live.status ? edit.status.value : live.status
  const priority = edit.priority && edit.priority.from === live.priority ? edit.priority.value : live.priority
  return status === live.status && priority === live.priority ? live : { ...live, status, priority }
}

export function mergeCases<C extends CrmCase>(live: readonly C[], edits: LocalEdits): C[] {
  return live.map((c) => mergeCase(c, edits[c.id]))
}

/**
 * The server's counts with this browser's edits applied: each edited case
 * leaves the buckets it was in and joins the ones it is in now. A case
 * closed here this week adds to Closed this week; reopening one cannot take
 * away, since the server's count does not say when it closed.
 */
export function adjustCounts(
  counts: CrmCounts,
  live: readonly CrmCase[],
  edits: LocalEdits,
  weekStartMs: number
): CrmCounts {
  const out = { ...counts }
  for (const c of live) {
    const edit = edits[c.id]
    const merged = mergeCase(c, edit)
    if (merged === c || merged.status === c.status) continue
    const delta = (x: CrmCase, sign: 1 | -1) => {
      if (isOpenCrmCase(x)) out.open += sign
      if (isWaitingOnUs(x)) out.waitingOnUs += sign
      if (x.status === "waiting_on_them") out.waitingOnThem += sign
    }
    delta(c, -1)
    delta(merged, 1)
    if (merged.status === "closed" && edit && Date.parse(edit.at) >= weekStartMs) out.closedThisWeek += 1
  }
  for (const key of ["open", "waitingOnUs", "waitingOnThem"] as const) out[key] = Math.max(0, out[key])
  return out
}
