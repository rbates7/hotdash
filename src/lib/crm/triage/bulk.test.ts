import { describe, expect, it } from "vitest"

import { distinctSenders, runBulk } from "@/lib/crm/triage/bulk"

const items = [{ id: "a" }, { id: "b" }, { id: "c" }]

describe("runBulk", () => {
  it("settles every item on its own: a sync throw and a rejection fail only their own", async () => {
    const seen: string[] = []
    const outcomes = await runBulk(items, async (item) => {
      seen.push(item.id)
      if (item.id === "a") throw new Error("boom")
      if (item.id === "b") return Promise.reject(new Error("nope"))
    })
    expect(seen).toEqual(["a", "b", "c"])
    expect(outcomes).toEqual([
      { id: "a", ok: false, error: "boom" },
      { id: "b", ok: false, error: "nope" },
      { id: "c", ok: true },
    ])
  })

  it("catches a synchronous runner", async () => {
    const outcomes = await runBulk(items, (item) => {
      if (item.id === "c") throw new Error("sync")
    })
    expect(outcomes.map((o) => o.ok)).toEqual([true, true, false])
  })

  it("runs a group once and shares its outcome, keeping the items' order", async () => {
    const rows = [
      { id: "1", sender: "x" },
      { id: "2", sender: "y" },
      { id: "3", sender: "x" },
    ]
    const ran: string[] = []
    const outcomes = await runBulk(
      rows,
      (row) => {
        ran.push(row.id)
        if (row.sender === "x") throw new Error("x failed")
      },
      { group: (row) => row.sender }
    )
    expect(ran).toEqual(["1", "2"])
    expect(outcomes).toEqual([
      { id: "1", ok: false, error: "x failed" },
      { id: "2", ok: true },
      { id: "3", ok: false, error: "x failed" },
    ])
  })

  it("keeps at most `concurrency` calls in flight", async () => {
    let active = 0
    let peak = 0
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }))
    const outcomes = await runBulk(
      many,
      async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 1))
        active -= 1
      },
      { concurrency: 3 }
    )
    expect(peak).toBe(3)
    expect(outcomes.every((o) => o.ok)).toBe(true)
  })
})

describe("distinctSenders", () => {
  it("counts senders case-insensitively", () => {
    expect(
      distinctSenders([{ senderEmail: "A@x.org" }, { senderEmail: "a@x.org " }, { senderEmail: "b@x.org" }])
    ).toEqual(["a@x.org", "b@x.org"])
  })
})
