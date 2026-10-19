import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { contactDisplayName } from "@/lib/crm/crm"
import { listTriageThreads } from "@/lib/crm/crm"
import {
  SEED_THREAD_IDS,
  seedCases,
  seedContacts,
  seedMessages,
  seedNotes,
  seedOrganizations,
} from "@/lib/crm/fixture"
import { FIXED_NOW_MS } from "@/test/clock"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"
import { initialShell, type LoadResult } from "@/lib/persistence"

import {
  STORAGE_KEY,
  crmStorage,
  dropSeed,
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

/**
 * The old help-desk sample as the old initialState built it — what a copy
 * saved before the sample was removed holds. The reducer tests pass it in
 * as plain rows to edit (the reducer is the same for the support inbox's
 * rows); nothing here expects the CRM to start from it.
 */
function oldSample(nowMs = NOW): State {
  return {
    ...initialState(nowMs),
    organizations: seedOrganizations(nowMs),
    contacts: seedContacts(nowMs),
    cases: seedCases(nowMs),
    messages: seedMessages(nowMs),
    notes: seedNotes(nowMs),
  }
}

/** A contact the founder adds by hand (the only rows a not-connected CRM keeps). */
const addPat = (state: State, organizationName: string | null = "Katy ISD") =>
  reducer(state, {
    type: "add-contact",
    input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes", organizationName },
    at: AT,
  })

afterEach(() => vi.restoreAllMocks())

describe("reducer", () => {
  it("starts empty, with every counter past the old sample's ids", () => {
    const s = initialState(NOW)
    const sample = oldSample()
    expect(s.organizations).toEqual([])
    expect(s.contacts).toEqual([])
    expect(s.cases).toEqual([])
    expect(s.messages).toEqual([])
    expect(s.notes).toEqual([])
    expect(s.ignoredSenders).toEqual([])
    expect(listTriageThreads(s.messages)).toHaveLength(0)
    expect(s.nextOrgId).toBe(sample.organizations.length + 1)
    expect(s.nextContactId).toBe(7)
    expect(s.nextCaseId).toBe(9)
    expect(s.nextCaseNumber).toBe(9)
    expect(s.nextNoteId).toBe(6)
    expect(s.nextMessageId).toBe(sample.messages.length + 1)
    expect(isState(s)).toBe(true)
  })

  it("changes status, writes a system note, and stamps closedAt", () => {
    const start = oldSample()
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
    const start = oldSample()
    expect(reducer(start, { type: "set-priority", id: "case-1", priority: "high" })).toBe(start)
    const next = reducer(start, { type: "set-priority", id: "case-1", priority: "urgent" })
    expect(next.cases.find((c) => c.id === "case-1")!.priority).toBe("urgent")
  })

  it("adds and deletes a user note; system notes stay", () => {
    const start = oldSample()
    const added = reducer(start, { type: "add-note", caseId: "case-1", body: "  ping staging  ", at: AT })
    expect(added.notes.at(-1)).toMatchObject({ id: "note-6", kind: "user", body: "ping staging" })
    const gone = reducer(added, { type: "delete-note", id: "note-6" })
    expect(gone.notes.find((n) => n.id === "note-6")).toBeUndefined()
    expect(reducer(start, { type: "delete-note", id: "note-2" })).toBe(start)
  })

  it("adds a contact to a fresh CRM under an id past the old sample's, and rejects a duplicate email", () => {
    const added = reducer(initialState(NOW), {
      type: "add-contact",
      input: { email: "  Pat@Example.ORG ", firstName: "Pat", lastName: "Reyes", organizationName: "Katy ISD" },
      at: AT,
    })
    const created = added.contacts.find((c) => c.id === "contact-7")!
    expect(added.contacts).toEqual([created])
    expect(created.email).toBe("pat@example.org")
    expect(created.source).toBe("manual")
    expect(created.nameSource).toBe("manual")
    expect(added.organizations.map((o) => o.name)).toEqual(["Katy ISD"])
    expect(created.organizationId).toBe(added.organizations[0].id)
    expect(reducer(added, { type: "add-contact", input: { email: "pat@example.org" }, at: AT })).toBe(
      added
    )
  })

  it("promotes a triage thread into a new contact and case", () => {
    const start = oldSample()
    const next = reducer(start, { type: "promote-triage", threadId: "thread-9", at: AT })
    expect(listTriageThreads(next.messages)).toHaveLength(1)
    const riley = next.contacts.find((c) => c.email === "riley@example.com")!
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
    const start = oldSample()
    const ignored = reducer(start, { type: "ignore-triage", threadId: "thread-9" })
    expect(listTriageThreads(ignored.messages)).toHaveLength(1)
    const banned = reducer(ignored, { type: "ignore-sender", email: "alex@example.com" })
    expect(listTriageThreads(banned.messages)).toHaveLength(0)
    expect(banned.ignoredSenders).toContain("alex@example.com")
  })
})

describe("parseState", () => {
  it("accepts a fresh CRM and the founder's copy, and strips unknown fields", () => {
    const fresh = initialState(NOW)
    expect(isState(fresh)).toBe(true)
    expect(parseState({ ...fresh, extra: true })).toEqual(fresh)
    const mine = addPat(fresh)
    expect(parseState({ ...mine, extra: true })).toEqual(stripState(mine))
  })

  it("rejects a bad case status, a colliding email, and a low counter", () => {
    const seed = oldSample()
    expect(parseState({ ...seed, cases: [{ ...seed.cases[0], status: "nope" }] })).toBeNull()
    expect(
      parseState({
        ...seed,
        contacts: [...seed.contacts, { ...seed.contacts[0], id: "contact-99" }],
        nextContactId: 100,
      })
    ).toBeNull()
    expect(parseState({ ...seed, nextCaseId: 1 })).toBeNull()
    const mine = addPat(initialState(NOW))
    expect(parseState({ ...mine, nextContactId: 7 })).toBeNull()
  })
})

describe("dropSeed: a copy saved before the sample was removed", () => {
  it("drops every sample organization, contact, case, message and note; counters stay put", () => {
    const old = oldSample()
    const cleaned = dropSeed(old)
    expect(cleaned).toEqual({ ...initialState(NOW), ignoredSenders: [] })
    expect(isState(cleaned)).toBe(true)
  })

  it("drops a sample case the founder edited (status change and a note) together with its notes", () => {
    let old = oldSample()
    old = reducer(old, { type: "set-status", id: "case-1", status: "waiting", at: AT })
    old = reducer(old, { type: "set-priority", id: "case-1", priority: "urgent" })
    old = reducer(old, { type: "add-note", caseId: "case-1", body: "Called back", at: AT })
    // The status change's system note and the user note took ids past the sample's.
    expect(old.notes.filter((n) => n.caseId === "case-1" && !seedNotes(NOW).some((s) => s.id === n.id))).toHaveLength(2)
    const cleaned = dropSeed(old)
    expect(cleaned.cases).toEqual([])
    expect(cleaned.notes).toEqual([])
    expect(cleaned.nextNoteId).toBe(old.nextNoteId)
  })

  it("drops a sample contact even after the founder edited it", () => {
    const old = reducer(oldSample(), {
      type: "update-contact",
      id: "contact-1",
      input: { email: seedContacts(NOW)[0].email, firstName: "Edited", lastName: "Name" },
    })
    expect(old.contacts.find((c) => c.id === "contact-1")?.firstName).toBe("Edited")
    expect(dropSeed(old).contacts).toEqual([])
  })

  it("drops a case promoted from a sample triage thread and the contact the promote created", () => {
    const old = reducer(oldSample(), { type: "promote-triage", threadId: "thread-9", at: AT })
    const promoted = old.cases.find((c) => c.id === "case-9")!
    expect(promoted).toBeDefined()
    const withNote = reducer(old, { type: "add-note", caseId: promoted.id, body: "On it", at: AT })
    expect(withNote.contacts.find((c) => c.id === "contact-7")?.source).toBe("gmail")
    const cleaned = dropSeed(withNote)
    expect(cleaned.contacts).toEqual([])
    expect(cleaned.cases).toEqual([])
    expect(cleaned.notes).toEqual([])
    expect(cleaned.messages.filter((m) => SEED_THREAD_IDS.has(m.threadId))).toEqual([])
    // Counters never move back, so nothing new reuses contact-7, case-9 or #9.
    expect(cleaned).toMatchObject({ nextContactId: 8, nextCaseId: 10, nextCaseNumber: 10 })
  })

  it("keeps a contact the founder added by hand, with the organization they typed", () => {
    const old = addPat(oldSample())
    const pat = old.contacts.find((c) => c.email === "pat@example.org")!
    const katy = old.organizations.find((o) => o.name === "Katy ISD")!
    expect(pat.organizationId).toBe(katy.id)
    const cleaned = dropSeed(old)
    expect(cleaned.contacts).toEqual([pat])
    expect(cleaned.organizations).toEqual([katy])
    expect(cleaned.nextContactId).toBe(old.nextContactId)
    expect(cleaned.nextOrgId).toBe(old.nextOrgId)
  })

  it("keeps a hand-added contact filed under a sample organization, with that link cleared", () => {
    const sampleOrg = seedOrganizations(NOW)[0]
    const old = addPat(oldSample(), sampleOrg.name)
    const pat = old.contacts.find((c) => c.email === "pat@example.org")!
    expect(pat.organizationId).toBe(sampleOrg.id)
    const cleaned = dropSeed(old)
    expect(cleaned.contacts).toEqual([{ ...pat, organizationId: null }])
    expect(cleaned.organizations).toEqual([])
  })

  it("keeps the founder's always-ignore list", () => {
    const old = reducer(oldSample(), { type: "ignore-sender", email: "alex@example.com" })
    expect(dropSeed(old).ignoredSenders).toEqual(["alex@example.com"])
  })

  it("never moves a counter back", () => {
    const old = { ...oldSample(), nextContactId: 40, nextCaseId: 50, nextCaseNumber: 60, nextNoteId: 70 }
    expect(dropSeed(old)).toMatchObject({ nextContactId: 40, nextCaseId: 50, nextCaseNumber: 60, nextNoteId: 70 })
  })

  it("returns the same object when there is nothing to drop", () => {
    const fresh = initialState(NOW)
    expect(dropSeed(fresh)).toBe(fresh)
    const mine = addPat(fresh)
    expect(dropSeed(mine)).toBe(mine)
  })

  it("runs on load (parseState / loadState) and writes nothing back", () => {
    const old = addPat(oldSample())
    expect(parseState(old)?.contacts.map((c) => c.email)).toEqual(["pat@example.org"])
    const raw = JSON.stringify(old)
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const loaded = loadState(window.localStorage)
    expect(loaded?.cases).toEqual([])
    expect(loaded?.contacts.map((c) => c.email)).toEqual(["pat@example.org"])
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })
})

describe("shell + persistence", () => {
  it("hydrates a saved copy and starts fresh on an empty key", () => {
    const fresh = initialState(NOW)
    const mine = addPat(fresh)
    let shell = initialShell(fresh, NOW)
    shell = shellReducer(shell, hydrate(mine))
    expect(shell.data.contacts.map((c) => c.email)).toEqual(["pat@example.org"])
    expect(shell.saved).toBe(true)
    shell = shellReducer(shell, hydrate(null, NOW + 1000))
    expect(shell.data).toEqual(initialState(NOW + 1000))
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
      <span data-testid="contacts">{store.contacts.map((c) => c.email).join("|")}</span>
      <button onClick={() => store.addContact({ email: "pat@example.org", firstName: "Pat" })}>add</button>
    </div>
  )
}

describe("CrmProvider", () => {
  it("hydrates before paint, starts empty, and writes only after a real edit", () => {
    render(
      <CrmProvider nowMs={NOW}>
        <Probe />
      </CrmProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("cases")).toHaveTextContent("0")
    expect(screen.getByTestId("contacts")).toBeEmptyDOMElement()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("contacts")).toHaveTextContent("pat@example.org")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"pat@example.org"')
  })

  it("an old copy loads without the sample and is not written back until an edit", () => {
    const old = oldSample()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(old))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(
      <CrmProvider nowMs={NOW}>
        <Probe />
      </CrmProvider>
    )
    expect(screen.getByTestId("cases")).toHaveTextContent("0")
    expect(screen.getByTestId("contacts")).toBeEmptyDOMElement()
    expect(setItem).not.toHaveBeenCalled()
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
    const theirs = addPat(initialState(NOW))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("contacts")).toHaveTextContent("pat@example.org")
    expect(crmStorage.load(window.localStorage).state?.contacts.map((c) => c.email)).toEqual(["pat@example.org"])
  })
})
