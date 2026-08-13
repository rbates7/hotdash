import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { ChlkStatus, ChlkTicketMeta, FounderStrip } from "@/lib/agents/types"

export type { ChlkStatus, ChlkTicketMeta }

type PersistedStore = {
  tickets: Record<string, ChlkTicketMeta>
}

const storeDir = path.join(os.homedir(), ".agent-kanban")
const storePath = path.join(storeDir, "chlk-tickets.json")

const globalForChlk = globalThis as typeof globalThis & {
  __chlkStore?: PersistedStore
  __chlkStoreHydrated?: boolean
}

function getMemStore(): PersistedStore {
  globalForChlk.__chlkStore ??= { tickets: {} }
  return globalForChlk.__chlkStore
}

async function hydrateOnce(): Promise<void> {
  if (globalForChlk.__chlkStoreHydrated) {
    return
  }
  globalForChlk.__chlkStoreHydrated = true
  try {
    const raw = await fs.readFile(storePath, "utf8")
    const disk = JSON.parse(raw) as PersistedStore
    const mem = getMemStore()
    for (const [id, meta] of Object.entries(disk.tickets ?? {})) {
      mem.tickets[id] ??= meta
    }
  } catch (error) {
    if (!isNodeFileError(error) || error.code !== "ENOENT") {
      // Non-fatal — continue with empty store
    }
  }
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(storeDir, { recursive: true })
    await fs.writeFile(storePath, `${JSON.stringify(getMemStore(), null, 2)}\n`)
  } catch {
    // best-effort — in-memory state remains authoritative
  }
}

export async function getAllTicketMetas(): Promise<ChlkTicketMeta[]> {
  await hydrateOnce()
  return Object.values(getMemStore().tickets)
}

export async function getTicketMeta(
  agentId: string
): Promise<ChlkTicketMeta | undefined> {
  await hydrateOnce()
  return getMemStore().tickets[agentId]
}

export type TicketUpdate = Partial<
  Omit<ChlkTicketMeta, "agentId" | "updatedAt">
>

export async function upsertTicketMeta(
  agentId: string,
  update: TicketUpdate
): Promise<ChlkTicketMeta> {
  await hydrateOnce()
  const store = getMemStore()

  // Atomically enforce at-most-one #1 priority
  if (update.isPriorityOne === true) {
    for (const meta of Object.values(store.tickets)) {
      if (meta.agentId !== agentId && meta.isPriorityOne) {
        meta.isPriorityOne = false
        meta.updatedAt = new Date().toISOString()
      }
    }
  }

  const existing = store.tickets[agentId]
  const nextStatus: ChlkStatus =
    update.chlkStatus ?? existing?.chlkStatus ?? "to_do"

  const next: ChlkTicketMeta = {
    agentId,
    owner: update.owner ?? existing?.owner,
    chlkStatus: nextStatus,
    // Clear blockerReason automatically when not blocked
    blockerReason:
      nextStatus === "blocked"
        ? (update.blockerReason ?? existing?.blockerReason)
        : undefined,
    isPriorityOne: update.isPriorityOne ?? existing?.isPriorityOne ?? false,
    needsFounderDecision:
      update.needsFounderDecision ??
      existing?.needsFounderDecision ??
      false,
    founderDecisionNote:
      update.founderDecisionNote ?? existing?.founderDecisionNote,
    updatedAt: new Date().toISOString(),
  }

  store.tickets[agentId] = next
  await persist()
  return next
}

export async function deleteTicketMeta(agentId: string): Promise<void> {
  await hydrateOnce()
  const store = getMemStore()
  delete store.tickets[agentId]
  await persist()
}

/** Derive the FounderStrip summary from the current store. */
export async function getFounderStrip(): Promise<FounderStrip> {
  await hydrateOnce()
  const store = getMemStore()
  let priorityOneId: string | null = null
  const founderDecisionIds: string[] = []

  for (const meta of Object.values(store.tickets)) {
    if (meta.isPriorityOne) {
      priorityOneId = meta.agentId
    }
    if (meta.needsFounderDecision) {
      founderDecisionIds.push(meta.agentId)
    }
  }

  return { priorityOneId, founderDecisionIds }
}

/** Merge all known Chlk ticket metadata into a list of agent cards in-place. */
export function mergeTicketMetasIntoCards(
  cards: import("@/lib/agents/types").AgentCard[],
  metas: ChlkTicketMeta[]
): void {
  const byId = new Map(metas.map((m) => [m.agentId, m]))
  for (const card of cards) {
    const meta = byId.get(card.id)
    if (!meta) {
      continue
    }
    card.owner = meta.owner
    card.chlkStatus = meta.chlkStatus
    card.blockerReason = meta.blockerReason
    card.isPriorityOne = meta.isPriorityOne
    card.needsFounderDecision = meta.needsFounderDecision
    card.founderDecisionNote = meta.founderDecisionNote
  }
}

function isNodeFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
