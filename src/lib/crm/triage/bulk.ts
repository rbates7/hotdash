/**
 * Bulk Triage: one call per item (or per group of items that share a call,
 * such as every thread from one sender), each settled on its own so a
 * failure on one card never drops the rest.
 */

export type TriageBulkAction = "ignore" | "promote" | "ignore-sender"

export type BulkOutcome = { id: string; ok: true } | { id: string; ok: false; error: string }

export type BulkTriageThread = {
  id: string
  senderEmail: string
  senderName: string | null
  subject: string | null
}

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Failed."
}

/**
 * Run `run` once per item, or once per group when `group` is given (the
 * group's first item is passed; every item in it shares the outcome). At
 * most `concurrency` calls are in flight. Sync throws and rejections are
 * both caught per call; the outcomes keep the items' order.
 */
export async function runBulk<T extends { id: string }>(
  items: readonly T[],
  run: (item: T) => unknown,
  { group, concurrency = 4 }: { group?: (item: T) => string; concurrency?: number } = {}
): Promise<BulkOutcome[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = group ? group(item) : item.id
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  const members = [...groups.values()]

  let active = 0
  const waiting: Array<() => void> = []
  async function limited(fn: () => unknown) {
    if (active >= concurrency) await new Promise<void>((resume) => waiting.push(resume))
    active += 1
    try {
      return await fn()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }

  const settled = await Promise.allSettled(members.map((list) => limited(() => run(list[0]!))))
  const byId = new Map<string, BulkOutcome>()
  settled.forEach((result, i) => {
    for (const item of members[i]!) {
      byId.set(
        item.id,
        result.status === "fulfilled"
          ? { id: item.id, ok: true }
          : { id: item.id, ok: false, error: message(result.reason) }
      )
    }
  })
  return items.map((item) => byId.get(item.id)!)
}

/** The distinct senders among `threads`, compared case-insensitively. */
export function distinctSenders(threads: readonly Pick<BulkTriageThread, "senderEmail">[]) {
  return [...new Set(threads.map((t) => t.senderEmail.trim().toLowerCase()))]
}
