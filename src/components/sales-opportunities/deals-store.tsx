"use client"

import * as React from "react"

import { now, todayIn, type IsoDay } from "@/lib/clock"
import {
  CAPS,
  clampText,
  dealsAreConsistent,
  isDeal,
  SEED_DEAL_IDS,
  stripDeal,
  type Deal,
  type DealInput,
  type Stage,
} from "@/lib/sales-opportunities"
import {
  createStorage,
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

/**
 * The saved copy. Deliberately no clock in here: `now` is volatile and
 * belongs to the request, so two tabs never disagree about it and a
 * hydrate never changes what would be written back.
 */
export type State = {
  deals: Deal[]
  /** Next number for a generated deal-n id. */
  nextId: number
}

export type Action =
  | { type: "add-deal"; input: DealInput; at: string }
  | { type: "edit-deal"; id: string; input: DealInput; at: string }
  | { type: "set-stage"; id: string; stage: Stage; at: string }
  | {
      type: "complete-next-step"
      id: string
      nextStep: string
      nextStepDue: IsoDay | null
      at: string
    }
  | { type: "delete-deal"; id: string }
  /** `nowMs` is the request's instant on mount, `now()` for a cross-tab event. */
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  /** `nowMs` is `now()` at the click (`reseedNowMs`), never the request's. */
  | { type: "reset"; nowMs: number }

/** The user's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

/** Trim, cap and round the dialog's fields the one way the store accepts them. */
export function normalizeInput(input: DealInput): DealInput {
  return {
    who: clampText(input.who, CAPS.who),
    org: clampText(input.org, CAPS.org),
    what: clampText(input.what, CAPS.what),
    value:
      input.value === null || !isFiniteNumber(input.value)
        ? null
        : Math.min(CAPS.value, Math.max(0, Math.round(input.value))),
    stage: input.stage,
    nextStep: clampText(input.nextStep, CAPS.nextStep),
    nextStepDue: input.nextStepDue,
    owner: input.owner,
  }
}

const INPUT_KEYS = ["who", "org", "what", "value", "stage", "nextStep", "nextStepDue", "owner"] as const

function sameInput(deal: Deal, input: DealInput) {
  return INPUT_KEYS.every((k) => deal[k] === input[k])
}

/** Replace one deal; `patch` returns the deal unchanged to signal a no-op. */
function patchDeal(state: State, id: string, patch: (deal: Deal) => Deal): State {
  const index = state.deals.findIndex((d) => d.id === id)
  if (index === -1) return state
  const before = state.deals[index]
  const after = patch(before)
  if (after === before) return state
  const deals = [...state.deals]
  deals[index] = after
  return { ...state, deals }
}

/**
 * The deals' own transitions. Pure, and every no-op — an Edit that changes
 * nothing, picking the stage a deal already has, deleting an id that is not
 * there — returns the same `state` object, which the shared shell reducer
 * reads as "nothing happened": not edited, `updatedAt` untouched, no write.
 */
export function reducer(state: State, action: EditAction): State {
  switch (action.type) {
    case "add-deal": {
      const input = normalizeInput(action.input)
      if (!input.who || !input.org || !input.what || !input.nextStep) return state
      const deal: Deal = {
        id: `deal-${state.nextId}`,
        ...input,
        lastTouch: action.at,
        createdAt: action.at,
        updatedAt: action.at,
      }
      return { ...state, deals: [...state.deals, deal], nextId: state.nextId + 1 }
    }

    case "edit-deal": {
      const input = normalizeInput(action.input)
      if (!input.who || !input.org || !input.what || !input.nextStep) return state
      return patchDeal(state, action.id, (deal) =>
        sameInput(deal, input)
          ? deal
          : // An edit is a conversation about the deal, so it counts as a touch.
            { ...deal, ...input, lastTouch: action.at, updatedAt: action.at }
      )
    }

    case "set-stage":
      return patchDeal(state, action.id, (deal) =>
        deal.stage === action.stage
          ? deal
          : { ...deal, stage: action.stage, lastTouch: action.at, updatedAt: action.at }
      )

    case "complete-next-step": {
      const nextStep = clampText(action.nextStep, CAPS.nextStep)
      if (!nextStep) return state
      return patchDeal(state, action.id, (deal) => ({
        ...deal,
        nextStep,
        nextStepDue: action.nextStepDue,
        lastTouch: action.at,
        updatedAt: action.at,
      }))
    }

    case "delete-deal": {
      const deals = state.deals.filter((d) => d.id !== action.id)
      return deals.length === state.deals.length ? state : { ...state, deals }
    }
  }
}

/**
 * A fresh pipeline: no deals. No sample rows, labelled or not (Rashad's
 * Oct 16 rule). Ids start after the old sample's so a new deal never takes
 * one of theirs. `nowMs` is unused, kept so the shell can pass its clock.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function initialState(_nowMs: number): State {
  return { deals: [], nextId: SEED_DEAL_IDS.size + 1 }
}

/**
 * A copy saved before the sample was removed still holds it: every sample
 * deal (by id) is dropped, edited or not; the founder's deals stay and the
 * id counter never moves back.
 */
export function dropSeed(state: State): State {
  const deals = state.deals.filter((d) => !SEED_DEAL_IDS.has(d.id))
  if (deals.length === state.deals.length) return state
  return { deals, nextId: Math.max(state.nextId, SEED_DEAL_IDS.size + 1) }
}

/**
 * Store actions mapped onto the shared persistence shell, which owns the
 * rules every screen shares: a hydrate never counts as an edit (and so never
 * writes), an empty or removed key empties the list at `nowMs` and moves the
 * clock, a pending local edit wins over an incoming copy, a no-op edit
 * returns the same shell, `saved` follows the write's result.
 */
type Shell = PersistenceShell<State>

/** The Central calendar day the shell's clock falls on. */
export const shellToday = (shell: Pick<Shell, "nowMs">): IsoDay => todayIn(new Date(shell.nowMs))

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        nowMs: action.nowMs,
        fallback: initialState,
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", nowMs: action.nowMs, seed: initialState })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Deals are saved to this browser's localStorage under the shared policy in
 * `@/lib/persistence`: only after a real edit, never an identical copy,
 * validated whole on load, Clear my entries clears the key, and the old
 * sample is dropped on load. Bump the version when the shape changes.
 */
export const STORAGE_KEY = "hotdash.sales-opportunities.v1"

/**
 * Every deal is checked field by field (see `isDeal`), ids are unique and
 * `nextId` sits above the highest id. Extra keys pass the guard and are
 * dropped by `parseState`.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.deals) || !v.deals.every(isDeal)) return false
  if (!isFiniteNumber(v.nextId)) return false
  return dealsAreConsistent(v.deals, v.nextId)
}

/** A validated copy with only the known keys at both levels. */
export function fromSaved(saved: State): State {
  return { deals: saved.deals.map(stripDeal), nextId: saved.nextId }
}

/** What `load` hands back: the stripped copy without the old sample, or null to reject it. */
export function parseState(value: unknown): State | null {
  return isState(value) ? dropSeed(fromSaved(value)) : null
}

export const dealsStorage = createStorage<State>({ key: STORAGE_KEY, parse: parseState })

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return dealsStorage.load(storage).state
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return dealsStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  dealsStorage.clear(storage)
}

/* --------------------------------------------------------------- provider */

type Store = State &
  PersistenceStore & {
    /**
     * The instant this page measures from: the request's on mount, then the
     * moment of a Clear (or of another tab's Clear). Held by
     * the shared shell; never read from a client clock in render.
     */
    nowMs: number
    /**
     * The shell clock as a Date. Derived from `shell.nowMs` — there is no
     * second clock. "Overdue" and last-touch labels measure from this.
     */
    now: Date
    /** `nowMs` as a Central calendar day. "Overdue" and "Due in" are measured from it. */
    today: IsoDay
    addDeal: (input: DealInput) => void
    editDeal: (id: string, input: DealInput) => void
    setStage: (id: string, stage: Stage) => void
    completeNextStep: (id: string, nextStep: string, nextStepDue: IsoDay | null) => void
    deleteDeal: (id: string) => void
  }

const DealsContext = React.createContext<Store | null>(null)

export function DealsProvider({
  nowMs: requestNowMs,
  children,
}: {
  /** `now().getTime()` from the server component rendering this page. */
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, (ms) =>
    initialShell(initialState(ms), ms)
  )
  const { data: state, nowMs, persisted, edited, saved, saveFailed } = shell
  const nowDate = React.useMemo(() => new Date(nowMs), [nowMs])
  const today = shellToday(shell)

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than an empty list. On the client the saved
  // copy is read in a layout effect — before the browser paints — so the
  // first visible frame is already the user's data, never a flash of the empty list. This is
  // the one hydrate dated by the request's instant.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: dealsStorage.load(window.localStorage), nowMs: requestNowMs })
  }, [requestNowMs])

  // Other tabs and writes, the shared way: a hydrate never writes; only a
  // moving edit count does. The hook reads `now()` for a cross-tab clear.
  const onHydrate = React.useCallback(
    (result: LoadResult<State>, at: number) => dispatch({ type: "hydrate", result, nowMs: at }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: dealsStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(() => {
    // An edit is a touch at the moment it happens: the shared clock, as on
    // the Workplace's edit timestamps.
    const at = () => now().toISOString()
    return {
      ...state,
      nowMs,
      now: nowDate,
      today,
      persisted,
      edited,
      saved,
      saveFailed,
      addDeal: (input) => dispatch({ type: "add-deal", input, at: at() }),
      editDeal: (id, input) => dispatch({ type: "edit-deal", id, input, at: at() }),
      setStage: (id, stage) => dispatch({ type: "set-stage", id, stage, at: at() }),
      completeNextStep: (id, nextStep, nextStepDue) =>
        dispatch({ type: "complete-next-step", id, nextStep, nextStepDue, at: at() }),
      deleteDeal: (id) => dispatch({ type: "delete-deal", id }),
      resetDemoData: () => {
        // Clear first, then regenerate from now — the one post-mount clock
        // read, shared by every screen — so the browser returns to the
        // never-edited state with an empty list dated today.
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }
  }, [state, nowMs, nowDate, today, persisted, edited, saved, saveFailed])

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>
}

export function useDeals() {
  const ctx = React.useContext(DealsContext)
  if (!ctx) throw new Error("useDeals must be used within a DealsProvider.")
  return ctx
}
