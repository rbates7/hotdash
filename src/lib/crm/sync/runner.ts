import { randomUUID } from "node:crypto"

import { and, desc, eq, lt, max, notInArray } from "drizzle-orm"

import type { Db } from "@/lib/crm/db/client"
import { syncRuns, type SyncRun, type SyncSource } from "@/lib/crm/db/schema"
import {
  createGmailApi,
  founderAliasesFromEnv,
} from "@/lib/crm/gmail/client"
import { syncGmail } from "@/lib/crm/gmail/sync"
import { DEFAULT_SYNC_WINDOW } from "@/lib/crm/gmail/window"
import { createStripeApi } from "@/lib/crm/stripe/client"
import { syncStripe } from "@/lib/crm/stripe/sync"
import {
  createContactsPolicyFromEnv,
  createSupabaseSource,
  syncSupabase,
} from "@/lib/crm/supabase/adapter"

// Placeholder implementations replaced in the Stripe/Supabase phase.
type SourceResult = {
  status: "success" | "skipped"
  message?: string
  stats?: Record<string, number>
}

async function runGmail(db: Db): Promise<SourceResult> {
  const { api, accountEmail } = await createGmailApi(db)
  const stats = await syncGmail(db, api, accountEmail, {
    founderAliases: founderAliasesFromEnv(),
    initialWindow: process.env.GMAIL_INITIAL_SYNC_WINDOW ?? DEFAULT_SYNC_WINDOW,
  })
  return { status: "success", stats: { ...stats } }
}

async function runStripe(db: Db): Promise<SourceResult> {
  const api = createStripeApi()
  if (!api) return { status: "skipped", message: "Not configured" }
  const stats = await syncStripe(db, api)
  return { status: "success", stats: { ...stats } }
}

async function runSupabase(db: Db): Promise<SourceResult> {
  const source = createSupabaseSource()
  if (!source) return { status: "skipped", message: "Not configured" }
  try {
    const stats = await syncSupabase(db, source, {
      createContacts: createContactsPolicyFromEnv(),
    })
    // A query that returns nothing is almost never right against a live app
    // database. The usual cause is row-level security: a fresh role with no
    // policy sees zero rows and no error, so without this the run reports a
    // clean success that enriched no one.
    if (stats.rowsSeen === 0) {
      return {
        status: "success",
        stats: { ...stats },
        message:
          "Query returned no rows. If the tables have data, row-level security is hiding them from crm_reader — see docs/CRM-SETUP.md.",
      }
    }
    return { status: "success", stats: { ...stats } }
  } finally {
    await source.close()
  }
}

const RUNNERS: Record<SyncSource, (db: Db) => Promise<SourceResult>> = {
  gmail: runGmail,
  stripe: runStripe,
  supabase: runSupabase,
}

const RUN_TIMEOUT_MS = 10 * 60 * 1000
const KEEP_RUNS_PER_SOURCE = 50

const activeRuns = new Set<string>()

function pruneRuns(db: Db, source: SyncSource) {
  const keep = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.source, source))
    .orderBy(desc(syncRuns.startedAt))
    .limit(KEEP_RUNS_PER_SOURCE)
    .all()
  db.delete(syncRuns)
    .where(
      and(
        eq(syncRuns.source, source),
        notInArray(
          syncRuns.id,
          keep.map((r) => r.id)
        )
      )
    )
    .run()
}

export type RunResult = {
  runId: string
  status: SyncRun["status"]
  message?: string | null
  stats?: Record<string, number> | null
}

export async function runSync(
  db: Db,
  source: SyncSource,
  trigger: "interval" | "manual"
): Promise<RunResult> {
  // Overlap guard: in-process mutex plus a DB check that survives restarts.
  if (activeRuns.has(source)) {
    return { runId: "", status: "running", message: "already_running" }
  }
  const staleBefore = new Date(Date.now() - RUN_TIMEOUT_MS)
  db.update(syncRuns)
    .set({ status: "error", message: "Timed out.", finishedAt: new Date() })
    .where(
      and(
        eq(syncRuns.status, "running"),
        lt(syncRuns.startedAt, staleBefore)
      )
    )
    .run()
  const runningRow = db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.source, source), eq(syncRuns.status, "running")))
    .get()
  if (runningRow) {
    return { runId: runningRow.id, status: "running", message: "already_running" }
  }

  const runId = randomUUID()
  db.insert(syncRuns)
    .values({
      id: runId,
      source,
      trigger,
      status: "running",
      startedAt: new Date(),
    })
    .run()
  activeRuns.add(source)

  try {
    const result = await RUNNERS[source](db)
    db.update(syncRuns)
      .set({
        status: result.status,
        message: result.message ?? null,
        stats: result.stats ?? null,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
      .run()
    return {
      runId,
      status: result.status,
      message: result.message ?? null,
      stats: result.stats ?? null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error."
    db.update(syncRuns)
      .set({ status: "error", message, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId))
      .run()
    return { runId, status: "error", message }
  } finally {
    activeRuns.delete(source)
    pruneRuns(db, source)
  }
}

/**
 * When each source last finished successfully. Only the Gmail sync keeps a
 * row in sync_state (it stores the history cursor), so reading last-synced
 * from there left Stripe and Supabase reading "Never synced" forever — even
 * straight after a run that imported thousands of customers. The runs table
 * is the record of what actually happened, so ask it instead.
 */
export function lastSuccessBySource(db: Db): Map<SyncSource, Date> {
  const rows = db
    .select({ source: syncRuns.source, finishedAt: max(syncRuns.finishedAt) })
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .groupBy(syncRuns.source)
    .all()
  const result = new Map<SyncSource, Date>()
  for (const row of rows) {
    if (row.finishedAt) result.set(row.source, new Date(row.finishedAt))
  }
  return result
}

export function listRuns(db: Db, source?: SyncSource, limit = 20): SyncRun[] {
  return db
    .select()
    .from(syncRuns)
    .where(source ? eq(syncRuns.source, source) : undefined)
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit)
    .all()
}
