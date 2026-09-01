import { describe, expect, it } from "vitest"

import { createDb, type Db } from "@/lib/crm/db/client"
import { syncRuns } from "@/lib/crm/db/schema"

import { lastSuccessBySource } from "./runner"

function addRun(
  db: Db,
  run: {
    id: string
    source: "gmail" | "stripe" | "supabase"
    status: "success" | "error" | "running"
    finishedAt: Date | null
  }
) {
  db.insert(syncRuns)
    .values({
      id: run.id,
      source: run.source,
      trigger: "interval",
      status: run.status,
      startedAt: new Date(0),
      finishedAt: run.finishedAt,
    })
    .run()
}

describe("lastSuccessBySource", () => {
  it("reports the newest success for each source independently", () => {
    const db = createDb(":memory:").db
    addRun(db, {
      id: "1",
      source: "stripe",
      status: "success",
      finishedAt: new Date("2026-09-01T18:00:00Z"),
    })
    addRun(db, {
      id: "2",
      source: "stripe",
      status: "success",
      finishedAt: new Date("2026-09-01T19:00:00Z"),
    })
    addRun(db, {
      id: "3",
      source: "gmail",
      status: "success",
      finishedAt: new Date("2026-09-01T17:00:00Z"),
    })

    const result = lastSuccessBySource(db)
    expect(result.get("stripe")).toEqual(new Date("2026-09-01T19:00:00Z"))
    expect(result.get("gmail")).toEqual(new Date("2026-09-01T17:00:00Z"))
    expect(result.has("supabase")).toBe(false)
  })

  it("ignores runs that failed or are still going", () => {
    const db = createDb(":memory:").db
    addRun(db, {
      id: "1",
      source: "stripe",
      status: "error",
      finishedAt: new Date("2026-09-01T19:00:00Z"),
    })
    addRun(db, {
      id: "2",
      source: "stripe",
      status: "running",
      finishedAt: null,
    })
    expect(lastSuccessBySource(db).has("stripe")).toBe(false)
  })
})
