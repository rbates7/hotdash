"use client"

import * as React from "react"

import {
  CASE_ID,
  CONTACT_ID,
  CRM_LIMITS,
  NOTE_ID,
  ORG_ID,
  STATUS_LABELS,
  contactOf,
  domainFromEmail,
  idNumber,
  isCase,
  isContact,
  isEmailMessage,
  isNote,
  isOrganization,
  normalizeContactInput,
  orgOf,
  sameContact,
  stripCase,
  stripContact,
  stripMessage,
  stripNote,
  stripOrganization,
  type Case,
  type CasePriority,
  type CaseStatus,
  type Contact,
  type ContactInput,
  type EmailMessage,
  type Note,
  type Organization,
} from "@/lib/crm/crm"
import { cleanSubject } from "@/lib/crm/rules"
import { normalizeEmail, splitDisplayName } from "@/lib/crm/matching"
import {
  seedCases,
  seedContacts,
  seedMessages,
  seedNotes,
  seedOrganizations,
} from "@/lib/crm/fixture"
import {
  createStorage,
  dedupe,
  initialShell,
  isFiniteNumber,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

export type State = {
  organizations: Organization[]
  contacts: Contact[]
  cases: Case[]
  messages: EmailMessage[]
  notes: Note[]
  ignoredSenders: string[]
  nextOrgId: number
  nextContactId: number
  nextCaseId: number
  nextMessageId: number
  nextNoteId: number
  nextCaseNumber: number
}

export type Action =
  | { type: "set-status"; id: string; status: CaseStatus; at: string }
  | { type: "set-priority"; id: string; priority: CasePriority }
  | { type: "add-note"; caseId: string; body: string; at: string }
  | { type: "delete-note"; id: string }
  | { type: "add-contact"; input: ContactInput; at: string }
  | { type: "update-contact"; id: string; input: ContactInput }
  | { type: "delete-contact"; id: string }
  | { type: "delete-case"; id: string }
  | { type: "promote-triage"; threadId: string; at: string }
  | { type: "link-triage"; threadId: string; contactId: string; at: string }
  | { type: "ignore-triage"; threadId: string }
  | { type: "ignore-sender"; email: string }
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; nowMs: number }

export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

function nextId(prefix: string, n: number) {
  return `${prefix}-${n}`
}

function findOrCreateOrg(
  state: State,
  organizationName: string | null,
  email: string
): { organizations: Organization[]; organizationId: string | null; nextOrgId: number } {
  if (organizationName) {
    const existing = state.organizations.find(
      (o) => o.name.toLowerCase() === organizationName.toLowerCase()
    )
    if (existing) {
      return {
        organizations: state.organizations,
        organizationId: existing.id,
        nextOrgId: state.nextOrgId,
      }
    }
    const org: Organization = {
      id: nextId("org", state.nextOrgId),
      name: organizationName,
      domain: domainFromEmail(email),
    }
    return {
      organizations: [...state.organizations, org],
      organizationId: org.id,
      nextOrgId: state.nextOrgId + 1,
    }
  }
  return {
    organizations: state.organizations,
    organizationId: null,
    nextOrgId: state.nextOrgId,
  }
}

function attachThreadToCase(
  state: State,
  threadId: string,
  caseId: string,
  at: string
): { messages: EmailMessage[]; casePatch: Partial<Case> } {
  let lastInbound: string | null = null
  let lastOutbound: string | null = null
  const messages = state.messages.map((m) => {
    if (m.threadId !== threadId) return m
    if (m.direction === "inbound") lastInbound = m.sentAt
    if (m.direction === "outbound") lastOutbound = m.sentAt
    return { ...m, caseId, triageState: null }
  })
  return {
    messages,
    casePatch: {
      lastActivityAt: at,
      lastInboundAt: lastInbound,
      lastOutboundAt: lastOutbound,
    },
  }
}

function threadSubject(state: State, threadId: string) {
  const first = state.messages.find((m) => m.threadId === threadId)
  return cleanSubject(first?.subject)
}

function promoteToCase(
  state: State,
  threadId: string,
  contactId: string,
  at: string
): State {
  const pending = state.messages.some((m) => m.threadId === threadId && m.triageState === "pending")
  if (!pending) return state
  const caseRow: Case = {
    id: nextId("case", state.nextCaseId),
    caseNumber: state.nextCaseNumber,
    subject: threadSubject(state, threadId),
    status: "new",
    priority: "normal",
    contactId,
    lastActivityAt: at,
    lastInboundAt: null,
    lastOutboundAt: null,
    closedAt: null,
    createdAt: at,
  }
  const { messages, casePatch } = attachThreadToCase(state, threadId, caseRow.id, at)
  return {
    ...state,
    cases: [...state.cases, { ...caseRow, ...casePatch }],
    messages,
    nextCaseId: state.nextCaseId + 1,
    nextCaseNumber: state.nextCaseNumber + 1,
  }
}

/** The list's own transitions. Returns its input for a no-op, as the shared shell requires. */
export function reducer(state: State, action: EditAction): State {
  switch (action.type) {
    case "set-status": {
      const current = state.cases.find((c) => c.id === action.id)
      if (!current || current.status === action.status) return state
      const closedAt = action.status === "closed" ? action.at : null
      const note: Note = {
        id: nextId("note", state.nextNoteId),
        caseId: current.id,
        kind: "system",
        body: `Status changed to ${STATUS_LABELS[action.status]}`,
        createdAt: action.at,
      }
      return {
        ...state,
        cases: state.cases.map((c) =>
          c.id === action.id
            ? { ...c, status: action.status, closedAt, lastActivityAt: action.at }
            : c
        ),
        notes: [...state.notes, note],
        nextNoteId: state.nextNoteId + 1,
      }
    }

    case "set-priority": {
      const current = state.cases.find((c) => c.id === action.id)
      if (!current || current.priority === action.priority) return state
      return {
        ...state,
        cases: state.cases.map((c) => (c.id === action.id ? { ...c, priority: action.priority } : c)),
      }
    }

    case "add-note": {
      const body = action.body.trim().slice(0, CRM_LIMITS.note)
      if (!body || !state.cases.some((c) => c.id === action.caseId)) return state
      const note: Note = {
        id: nextId("note", state.nextNoteId),
        caseId: action.caseId,
        kind: "user",
        body,
        createdAt: action.at,
      }
      return {
        ...state,
        notes: [...state.notes, note],
        nextNoteId: state.nextNoteId + 1,
        cases: state.cases.map((c) =>
          c.id === action.caseId ? { ...c, lastActivityAt: action.at } : c
        ),
      }
    }

    case "delete-note": {
      const note = state.notes.find((n) => n.id === action.id)
      if (!note || note.kind !== "user") return state
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) }
    }

    case "add-contact": {
      const input = normalizeContactInput(action.input)
      if (!input.email.includes("@")) return state
      if (state.contacts.some((c) => c.email === input.email)) return state
      const org = findOrCreateOrg(state, input.organizationName, input.email)
      const contact: Contact = {
        id: nextId("contact", state.nextContactId),
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        nameSource: "manual",
        organizationId: org.organizationId,
        plan: null,
        planStatus: null,
        source: "manual",
        createdAt: action.at,
      }
      return {
        ...state,
        organizations: org.organizations,
        contacts: [...state.contacts, contact],
        nextOrgId: org.nextOrgId,
        nextContactId: state.nextContactId + 1,
      }
    }

    case "update-contact": {
      const current = state.contacts.find((c) => c.id === action.id)
      if (!current) return state
      const input = normalizeContactInput({ ...action.input, email: current.email })
      const org = findOrCreateOrg(state, input.organizationName, current.email)
      const next: Contact = {
        ...current,
        firstName: input.firstName,
        lastName: input.lastName,
        nameSource: "manual",
        organizationId: org.organizationId,
      }
      if (sameContact(current, next) && org.organizations === state.organizations) return state
      return {
        ...state,
        organizations: org.organizations,
        contacts: state.contacts.map((c) => (c.id === action.id ? next : c)),
        nextOrgId: org.nextOrgId,
      }
    }

    case "delete-contact": {
      if (!state.contacts.some((c) => c.id === action.id)) return state
      const caseIds = new Set(state.cases.filter((c) => c.contactId === action.id).map((c) => c.id))
      return {
        ...state,
        contacts: state.contacts.filter((c) => c.id !== action.id),
        cases: state.cases.filter((c) => c.contactId !== action.id),
        notes: state.notes.filter((n) => !caseIds.has(n.caseId)),
        messages: state.messages.filter((m) => !m.caseId || !caseIds.has(m.caseId)),
      }
    }

    case "delete-case": {
      if (!state.cases.some((c) => c.id === action.id)) return state
      return {
        ...state,
        cases: state.cases.filter((c) => c.id !== action.id),
        notes: state.notes.filter((n) => n.caseId !== action.id),
        messages: state.messages.filter((m) => m.caseId !== action.id),
      }
    }

    case "promote-triage": {
      const thread = state.messages.filter(
        (m) => m.threadId === action.threadId && m.triageState === "pending"
      )
      if (thread.length === 0) return state
      const inbound = thread.find((m) => m.direction === "inbound") ?? thread[0]!
      const email = normalizeEmail(inbound.fromEmail)
      const existing = state.contacts.find((c) => c.email === email)
      if (existing) return promoteToCase(state, action.threadId, existing.id, action.at)
      const split = splitDisplayName(inbound.fromName)
      const org = findOrCreateOrg(state, null, email)
      const domain = domainFromEmail(email)
      const byDomain = domain
        ? state.organizations.find((o) => o.domain === domain)
        : undefined
      const organizationId = org.organizationId ?? byDomain?.id ?? null
      let organizations = org.organizations
      let nextOrgId = org.nextOrgId
      if (!organizationId && domain) {
        const created: Organization = {
          id: nextId("org", nextOrgId),
          name: domain,
          domain,
        }
        organizations = [...organizations, created]
        nextOrgId += 1
        const contact: Contact = {
          id: nextId("contact", state.nextContactId),
          email,
          firstName: split.firstName,
          lastName: split.lastName,
          nameSource: inbound.fromName ? "gmail" : null,
          organizationId: created.id,
          plan: null,
          planStatus: null,
          source: "gmail",
          createdAt: action.at,
        }
        return promoteToCase(
          {
            ...state,
            organizations,
            contacts: [...state.contacts, contact],
            nextOrgId,
            nextContactId: state.nextContactId + 1,
          },
          action.threadId,
          contact.id,
          action.at
        )
      }
      const contact: Contact = {
        id: nextId("contact", state.nextContactId),
        email,
        firstName: split.firstName,
        lastName: split.lastName,
        nameSource: inbound.fromName ? "gmail" : null,
        organizationId,
        plan: null,
        planStatus: null,
        source: "gmail",
        createdAt: action.at,
      }
      return promoteToCase(
        {
          ...state,
          organizations,
          contacts: [...state.contacts, contact],
          nextOrgId,
          nextContactId: state.nextContactId + 1,
        },
        action.threadId,
        contact.id,
        action.at
      )
    }

    case "link-triage": {
      if (!state.contacts.some((c) => c.id === action.contactId)) return state
      return promoteToCase(state, action.threadId, action.contactId, action.at)
    }

    case "ignore-triage": {
      if (!state.messages.some((m) => m.threadId === action.threadId && m.triageState === "pending")) {
        return state
      }
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.threadId === action.threadId && m.triageState === "pending"
            ? { ...m, triageState: "ignored" }
            : m
        ),
      }
    }

    case "ignore-sender": {
      const email = normalizeEmail(action.email)
      if (state.ignoredSenders.includes(email)) return state
      return {
        ...state,
        ignoredSenders: [...state.ignoredSenders, email],
        messages: state.messages.map((m) =>
          normalizeEmail(m.fromEmail) === email && m.triageState === "pending"
            ? { ...m, triageState: "ignored" }
            : m
        ),
      }
    }
  }
}

type Shell = PersistenceShell<State>

const seedAt = (nowMs: number) => initialState(nowMs)

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        nowMs: action.nowMs,
        fallback: seedAt,
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", nowMs: action.nowMs, seed: seedAt })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
  }
}

export function initialState(nowMs: number): State {
  const organizations = seedOrganizations(nowMs)
  const contacts = seedContacts(nowMs)
  const cases = seedCases(nowMs)
  const messages = seedMessages(nowMs)
  const notes = seedNotes(nowMs)
  return {
    organizations,
    contacts,
    cases,
    messages,
    notes,
    ignoredSenders: [],
    nextOrgId: highest(organizations, ORG_ID) + 1,
    nextContactId: highest(contacts, CONTACT_ID) + 1,
    nextCaseId: highest(cases, CASE_ID) + 1,
    nextMessageId: highest(messages, /^message-(\d+)$/) + 1,
    nextNoteId: highest(notes, NOTE_ID) + 1,
    nextCaseNumber: cases.reduce((max, c) => Math.max(max, c.caseNumber), 0) + 1,
  }
}

function highest<T extends { id: string }>(rows: readonly T[], re: RegExp) {
  return rows.reduce((max, r) => Math.max(max, idNumber(r.id, re)), 0)
}

export const STORAGE_KEY = "hotdash.crm.v1"

export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.organizations) || !v.organizations.every(isOrganization)) return false
  if (!Array.isArray(v.contacts) || !v.contacts.every(isContact)) return false
  if (!Array.isArray(v.cases) || !v.cases.every(isCase)) return false
  if (!Array.isArray(v.messages) || !v.messages.every(isEmailMessage)) return false
  if (!Array.isArray(v.notes) || !v.notes.every(isNote)) return false
  if (!Array.isArray(v.ignoredSenders) || !v.ignoredSenders.every((e) => typeof e === "string")) {
    return false
  }
  if (dedupe(v.organizations.map((o) => o.id)).length !== v.organizations.length) return false
  if (dedupe(v.contacts.map((c) => c.id)).length !== v.contacts.length) return false
  if (dedupe(v.cases.map((c) => c.id)).length !== v.cases.length) return false
  if (dedupe(v.contacts.map((c) => c.email)).length !== v.contacts.length) return false
  if (dedupe(v.cases.map((c) => c.caseNumber)).length !== v.cases.length) return false
  const orgIds = new Set(v.organizations.map((o) => o.id))
  if (v.contacts.some((c) => c.organizationId && !orgIds.has(c.organizationId))) return false
  const contactIds = new Set(v.contacts.map((c) => c.id))
  if (v.cases.some((c) => !contactIds.has(c.contactId))) return false
  const caseIds = new Set(v.cases.map((c) => c.id))
  if (v.notes.some((n) => !caseIds.has(n.caseId))) return false
  if (v.messages.some((m) => m.caseId && !caseIds.has(m.caseId))) return false
  const counters: Array<[unknown, number]> = [
    [v.nextOrgId, highest(v.organizations, ORG_ID)],
    [v.nextContactId, highest(v.contacts, CONTACT_ID)],
    [v.nextCaseId, highest(v.cases, CASE_ID)],
    [v.nextMessageId, highest(v.messages, /^message-(\d+)$/)],
    [v.nextNoteId, highest(v.notes, NOTE_ID)],
  ]
  for (const [raw, max] of counters) {
    if (!isFiniteNumber(raw) || !Number.isInteger(raw) || raw <= max) return false
  }
  if (!isFiniteNumber(v.nextCaseNumber) || !Number.isInteger(v.nextCaseNumber)) return false
  const maxNumber = v.cases.reduce((max, c) => Math.max(max, c.caseNumber), 0)
  if (v.nextCaseNumber <= maxNumber) return false
  return true
}

export function stripState(state: State): State {
  return {
    organizations: state.organizations.map(stripOrganization),
    contacts: state.contacts.map(stripContact),
    cases: state.cases.map(stripCase),
    messages: state.messages.map(stripMessage),
    notes: state.notes.map(stripNote),
    ignoredSenders: [...state.ignoredSenders],
    nextOrgId: state.nextOrgId,
    nextContactId: state.nextContactId,
    nextCaseId: state.nextCaseId,
    nextMessageId: state.nextMessageId,
    nextNoteId: state.nextNoteId,
    nextCaseNumber: state.nextCaseNumber,
  }
}

export function parseState(value: unknown): State | null {
  return isState(value) ? stripState(value) : null
}

export const crmStorage = createStorage<State>({ key: STORAGE_KEY, parse: parseState })

export function loadState(storage: Storage | undefined): State | null {
  return crmStorage.load(storage).state
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return crmStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  crmStorage.clear(storage)
}

export type CrmStore = State &
  PersistenceStore & {
    nowMs: number
    setStatus: (id: string, status: CaseStatus) => void
    setPriority: (id: string, priority: CasePriority) => void
    addNote: (caseId: string, body: string) => void
    deleteNote: (id: string) => void
    addContact: (input: ContactInput) => void
    updateContact: (id: string, input: ContactInput) => void
    deleteContact: (id: string) => void
    deleteCase: (id: string) => void
    promoteTriage: (threadId: string) => void
    linkTriage: (threadId: string, contactId: string) => void
    ignoreTriage: (threadId: string) => void
    ignoreSender: (email: string) => void
    contactById: (id: string) => Contact | undefined
    orgById: (id: string | null) => Organization | null
    caseById: (id: string) => Case | undefined
  }

const CrmContext = React.createContext<CrmStore | null>(null)

export function CrmProvider({
  nowMs: requestNowMs,
  children,
}: {
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, (ms) =>
    initialShell(seedAt(ms), ms)
  )
  const { data: state, persisted, edited, saved, saveFailed, nowMs } = shell

  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: crmStorage.load(window.localStorage), nowMs: requestNowMs })
  }, [requestNowMs])

  const onHydrate = React.useCallback(
    (result: LoadResult<State>, hydrateNowMs: number) =>
      dispatch({ type: "hydrate", result, nowMs: hydrateNowMs }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: crmStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<CrmStore>(
    () => ({
      ...state,
      nowMs,
      persisted,
      edited,
      saved,
      saveFailed,
      setStatus: (id, status) =>
        dispatch({ type: "set-status", id, status, at: new Date().toISOString() }),
      setPriority: (id, priority) => dispatch({ type: "set-priority", id, priority }),
      addNote: (caseId, body) =>
        dispatch({ type: "add-note", caseId, body, at: new Date().toISOString() }),
      deleteNote: (id) => dispatch({ type: "delete-note", id }),
      addContact: (input) =>
        dispatch({ type: "add-contact", input, at: new Date().toISOString() }),
      updateContact: (id, input) => dispatch({ type: "update-contact", id, input }),
      deleteContact: (id) => dispatch({ type: "delete-contact", id }),
      deleteCase: (id) => dispatch({ type: "delete-case", id }),
      promoteTriage: (threadId) =>
        dispatch({ type: "promote-triage", threadId, at: new Date().toISOString() }),
      linkTriage: (threadId, contactId) =>
        dispatch({ type: "link-triage", threadId, contactId, at: new Date().toISOString() }),
      ignoreTriage: (threadId) => dispatch({ type: "ignore-triage", threadId }),
      ignoreSender: (email) => dispatch({ type: "ignore-sender", email }),
      contactById: (id) => contactOf(state.contacts, id),
      orgById: (id) => orgOf(state.organizations, id),
      caseById: (id) => state.cases.find((c) => c.id === id),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }),
    [state, nowMs, persisted, edited, saved, saveFailed]
  )

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const ctx = React.useContext(CrmContext)
  if (!ctx) throw new Error("useCrm must be used within a CrmProvider.")
  return ctx
}
