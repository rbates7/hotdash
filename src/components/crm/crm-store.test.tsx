import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { contactDisplayName } from "@/lib/crm/crm"
import { listTriageThreads } from "@/lib/crm/crm"
import { FIXED_NOW_MS } from "@/test/clock"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"
import { initialShell, type LoadResult } from "@/lib/persistence"

import {
  STORAGE_KEY,
  crmStorage,
  initialState,
  isState,
  loadState,
  parseState,
  reducer,
  saveState,
  shellReducer,
  stripState,
  useCrm,
  CrmProvider,
  type State,
} from "./crm-store"

const NOW = FIXED_NOW_MS
const AT = new Date(NOW).toISOString()

const hydrate = (state: State | null, nowMs = NOW) => {
  const result: LoadResult<State> = state
    ? { state, status: "saved" }
    : { state: null, status: "empty" }
  return { type: "hydrate" as const, result, nowMs }
}

afterEach(() => vi.restoreAllMocks())

describe("reducer", () => {
  it("starts with the seed and counters after the last ids", () => {
    const s = initialState(NOW)
    expect(s.contacts).toHaveLength(6)
    expect(s.cases).toHaveLength(8)
    expect(s.nextContactId).toBe(7)
    expect(s.nextCaseId).toBe(9)
    expect(s.nextCaseNumber).toBe(9)
    expect(listTriageThreads(s.messages)).toHaveLength(2)
  })

  it("changes status, writes a system note, and stamps closedAt", () => {
    const start = initialState(NOW)
    const same = reducer(start, { type: "set-status", id: "case-1", status: "open", at: AT })
    expect(same).toBe(start)
    const next = reducer(start, { type: "set-status", id: "case-1", status: "waiting", at: AT })
    expect(next.cases.find((c) => c.id === "case-1")!.status).toBe("waiting")
    expect(next.notes.at(-1)).toMatchObject({
      kind: "system",
      body: "Status changed to Waiting on customer",
    })
    const closed = reducer(next, { type: "set-status", id: "case-1", status: "closed", at: AT })
    expect(closed.cases.find((c) => c.id === "case-1")!.closedAt).toBe(AT)
  })

  it("changes priority and is a no-op when unchanged", () => {
    const start = initialState(NOW)
    expect(reducer(start, { type: "set-priority", id: "case-1", priority: "high" })).toBe(start)
    const next = reducer(start, { type: "set-priority", id: "case-1", priority: "urgent" })
    expect(next.cases.find((c) => c.id === "case-1")!.priority).toBe("urgent")
  })

  it("adds and deletes a user note; system notes stay", () => {
    const start = initialState(NOW)
    const added = reducer(start, { type: "add-note", caseId: "case-1", body: "  ping staging  ", at: AT })
    expect(added.notes.at(-1)).toMatchObject({ id: "note-6", kind: "user", body: "ping staging" })
    const gone = reducer(added, { type: "delete-note", id: "note-6" })
    expect(gone.notes.find((n) => n.id === "note-6")).toBeUndefined()
    expect(reducer(start, { type: "delete-note", id: "note-2" })).toBe(start)
  })

  it("adds a contact without a sample id and rejects a duplicate email", () => {
    const start = initialState(NOW)
    const added = reducer(start, {
      type: "add-contact",
      input: { email: "  Pat@Katy.isd ", firstName: "Pat", lastName: "Reyes", organizationName: "Katy ISD" },
      at: AT,
    })
    const created = added.contacts.find((c) => c.id === "contact-7")!
    expect(created.email).toBe("pat@katy.isd")
    expect(created.source).toBe("manual")
    expect(created.nameSource).toBe("manual")
    expect(added.organizations.some((o) => o.name === "Katy ISD")).toBe(true)
    expect(reducer(added, { type: "add-contact", input: { email: "pat@katy.isd" }, at: AT })).toBe(
      added
    )
  })

  it("promotes a triage thread into a new contact and case", () => {
    const start = initialState(NOW)
    const next = reducer(start, { type: "promote-triage", threadId: "thread-9", at: AT })
    expect(listTriageThreads(next.messages)).toHaveLength(1)
    const riley = next.contacts.find((c) => c.email === "riley@lakeridgeathletics.com")!
    expect(contactDisplayName(riley)).toBe("Riley Nash")
    expect(riley.id).toBe("contact-7")
    const opened = next.cases.find((c) => c.contactId === riley.id)!
    expect(opened.caseNumber).toBe(9)
    expect(opened.subject).toBe("Playbook sync after Friday's install")
    expect(opened.status).toBe("new")
    expect(next.messages.filter((m) => m.threadId === "thread-9").every((m) => m.caseId === opened.id)).toBe(
      true
    )
  })

  it("ignores a triage thread and always-ignore a sender", () => {
    const start = initialState(NOW)
    const ignored = reducer(start, { type: "ignore-triage", threadId: "thread-9" })
    expect(listTriageThreads(ignored.messages)).toHaveLength(1)
    const banned = reducer(ignored, { type: "ignore-sender", email: "alex@oakmontcoaches.net" })
    expect(listTriageThreads(banned.messages)).toHaveLength(0)
    expect(banned.ignoredSenders).toContain("alex@oakmontcoaches.net")
  })
})

describe("parseState", () => {
  it("accepts the seed and strips unknown fields", () => {
    const seed = initialState(NOW)
    expect(isState(seed)).toBe(true)
    expect(parseState({ ...seed, extra: true })).toEqual(stripState(seed))
  })

  it("rejects a bad case status, a colliding email, and a low counter", () => {
    const seed = initialState(NOW)
    expect(parseState({ ...seed, cases: [{ ...seed.cases[0], status: "nope" }] })).toBeNull()
    expect(
      parseState({
        ...seed,
        contacts: [...seed.contacts, { ...seed.contacts[0], id: "contact-99" }],
        nextContactId: 100,
      })
    ).toBeNull()
    expect(parseState({ ...seed, nextCaseId: 1 })).toBeNull()
  })
})

describe("shell + persistence", () => {
  it("hydrates a saved copy and re-seeds on an empty key", () => {
    const seed = initialState(NOW)
    const edited = reducer(seed, { type: "set-priority", id: "case-1", priority: "low" })
    let shell = initialShell(seed, NOW)
    shell = shellReducer(shell, hydrate(edited))
    expect(shell.data.cases.find((c) => c.id === "case-1")!.priority).toBe("low")
    expect(shell.saved).toBe(true)
    shell = shellReducer(shell, hydrate(null, NOW + 1000))
    expect(shell.data.cases.find((c) => c.id === "case-1")!.priority).toBe("high")
    expect(shell.saved).toBe(false)
  })

  it("load is pure: a junk copy is left alone until the first save parks it", () => {
    const junk = '{"cases":[{"id":"case-1","status":"nope"}]}'
    window.localStorage.setItem(STORAGE_KEY, junk)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(junk)
    saveState(window.localStorage, initialState(NOW))
    const parked = JSON.parse(window.localStorage.getItem(`${STORAGE_KEY}.rejected`) ?? "[]") as {
      raw: string
    }[]
    expect(parked[0]?.raw).toBe(junk)
  })
})

function Probe() {
  const store = useCrm()
  return (
    <div>
      <span data-testid="persisted">{String(store.persisted)}</span>
      <span data-testid="cases">{store.cases.length}</span>
      <button onClick={() => store.setPriority("case-1", "low")}>prio</button>
    </div>
  )
}

describe("CrmProvider", () => {
  it("hydrates before paint and writes only after a real edit", () => {
    render(
      <CrmProvider nowMs={NOW}>
        <Probe />
      </CrmProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("cases")).toHaveTextContent("8")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    act(() => screen.getByRole("button", { name: "prio" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"low"')
  })

  it("a failed save is reported and the key stays empty", () => {
    const storage = quotaExceededStorage()
    expect(saveState(storage, initialState(NOW))).toBe(false)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("hears another tab's write", () => {
    render(
      <CrmProvider nowMs={NOW}>
        <Probe />
      </CrmProvider>
    )
    const edited = reducer(initialState(NOW), { type: "set-priority", id: "case-1", priority: "low" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(edited))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(edited)))
    expect(crmStorage.load(window.localStorage).state?.cases.find((c) => c.id === "case-1")?.priority).toBe(
      "low"
    )
  })
})
