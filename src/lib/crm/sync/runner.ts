import { randomUUID } from "node:crypto"

import { and, desc, eq, lt, notInArray } from "drizzle-orm"

import type { Db } from "@/lib/crm/db/client"
import {
  syncLeases,
  syncRuns,
  type SyncRun,
  type SyncSource,
} from "@/lib/crm/db/schema"
import { isSyncPaused } from "@/lib/crm/settings/server"
import {
  createGmailApi,
  founderAliasesFromEnv,
} from "@/lib/crm/gmail/client"
import { syncGmail } from "@/lib/crm/gmail/sync"
import { createStripeApi } from "@/lib/crm/stripe/client"
import { syncStripe } from "@/lib/crm/stripe/sync"
import { createSupabaseSource, syncSupabase } from "@/lib/crm/supabase/adapter"

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
    initialWindow: process.env.CRM_GMAIL_INITIAL_SYNC_WINDOW ?? "30d",
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
    const stats = await syncSupabase(db, source)
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

async function pruneRuns(db: Db, source: SyncSource) {
  const keep = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.source, source))
    .orderBy(desc(syncRuns.startedAt))
    .limit(KEEP_RUNS_PER_SOURCE)
  await db.delete(syncRuns)
    .where(
      and(
        eq(syncRuns.source, source),
        notInArray(
          syncRuns.id,
          keep.map((r) => r.id)
        )
      )
    )
}

export async function acquireSyncLease(
  db: Db,
  source: SyncSource,
  ownerId: string
) {
  const now = new Date()
  const [lease] = await db
    .insert(syncLeases)
    .values({
      source,
      ownerId,
      expiresAt: new Date(now.getTime() + RUN_TIMEOUT_MS),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncLeases.source,
      set: {
        ownerId,
        expiresAt: new Date(now.getTime() + RUN_TIMEOUT_MS),
        updatedAt: now,
      },
      setWhere: lt(syncLeases.expiresAt, now),
    })
    .returning()
  return Boolean(lease)
}

async function releaseLease(db: Db, source: SyncSource, ownerId: string) {
  await db
    .delete(syncLeases)
    .where(and(eq(syncLeases.source, source), eq(syncLeases.ownerId, ownerId)))
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
  if (trigger === "interval" && (await isSyncPaused(db))) {
    return { runId: "", status: "skipped", message: "paused" }
  }
  const runId = randomUUID()
  if (!(await acquireSyncLease(db, source, runId))) {
    return { runId: "", status: "running", message: "already_running" }
  }

  try {
    const staleBefore = new Date(Date.now() - RUN_TIMEOUT_MS)
    await db
      .update(syncRuns)
      .set({ status: "error", message: "Timed out.", finishedAt: new Date() })
      .where(
        and(
          eq(syncRuns.source, source),
          eq(syncRuns.status, "running"),
          lt(syncRuns.startedAt, staleBefore)
        )
      )
    await db.insert(syncRuns).values({
      id: runId,
      source,
      trigger,
      status: "running",
      startedAt: new Date(),
    })

    const result = await RUNNERS[source](db)
    await db.update(syncRuns)
      .set({
        status: result.status,
        message: result.message ?? null,
        stats: result.stats ?? null,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
    return {
      runId,
      status: result.status,
      message: result.message ?? null,
      stats: result.stats ?? null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error."
    await db.update(syncRuns)
      .set({ status: "error", message, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId))
    return { runId, status: "error", message }
  } finally {
    await releaseLease(db, source, runId)
    await pruneRuns(db, source)
  }
}

export async function listRuns(
  db: Db,
  source?: SyncSource,
  limit = 20
): Promise<SyncRun[]> {
  return await db
    .select()
    .from(syncRuns)
    .where(source ? eq(syncRuns.source, source) : undefined)
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit)
}
