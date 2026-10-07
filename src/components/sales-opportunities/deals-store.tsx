"use client"

import * as React from "react"

import { now, todayIn, type IsoDay } from "@/lib/clock"
import {
  CAPS,
  clampText,
  dealsAreConsistent,
  highestDealId,
  isDeal,
  seedDeals,
  stripDeal,
  type Deal,
  type DealInput,
  type Stage,
} from "@/lib/sales-opportunities"
import {
  createStorage,
  isFiniteNumber,
  type LoadResult,
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
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; nowMs: number }

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
 * Pure. Every no-op — an Edit that changes nothing, picking the stage a
 * deal already has, deleting an id that is not there — returns the same
 * `state` object, so nothing is marked edited and `updatedAt` stays put.
 */
export function reducer(state: State, action: Action): State {
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
        sample: false,
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

    case "hydrate":
      if (action.result.state) return fromSaved(action.result.state)
      // Nothing saved (or the other tab Reset): back to the seed for today.
      if (action.result.status === "error") return state
      return initialState(action.nowMs)

    case "save-result":
      return state

    case "reset":
      return initialState(action.nowMs)
  }
}

/** The seed for the moment the page was requested. */
export function initialState(nowMs: number): State {
  const deals = seedDeals(nowMs)
  return { deals, nextId: highestDealId(deals) + 1 }
}

/** A validated saved copy, with any unknown keys stripped at both levels. */
export function fromSaved(saved: State): State {
  return { deals: saved.deals.map(stripDeal), nextId: saved.nextId }
}

/** Actions that are the founder's own edits, as opposed to plumbing. */
const USER_EDITS = new Set<Action["type"]>([
  "add-deal",
  "edit-deal",
  "set-stage",
  "complete-next-step",
  "delete-deal",
])

/**
 * Reducer state plus persistence bookkeeping (see `PersistenceStatus`),
 * and `dirty`: there is an edit of ours that has not been written yet.
 * Only a user edit sets it; a hydrate — on load or from another tab —
 * never does, so a hydrate can never cause a save.
 */
type Shell = {
  data: State
  hydrated: boolean
  edited: boolean
  saved: boolean
  saveFailed: boolean
  dirty: boolean
}

export function shellReducer(shell: Shell, action: Action): Shell {
  const data = reducer(shell.data, action)
  switch (action.type) {
    case "hydrate": {
      const { status } = action.result
      if (status === "error") return { ...shell, data, hydrated: true, dirty: false }
      return {
        data,
        hydrated: true,
        // A saved copy from this or another tab is theirs; an empty or
        // removed key (Reset elsewhere) means there is nothing of ours left.
        edited: status === "saved" ? shell.edited : false,
        saved: status === "saved",
        saveFailed: false,
        dirty: false,
      }
    }
    case "save-result":
      return {
        ...shell,
        data,
        saved: action.ok ? true : shell.saved,
        saveFailed: !action.ok,
        dirty: false,
      }
    case "reset":
      return { data, hydrated: shell.hydrated, edited: false, saved: false, saveFailed: false, dirty: false }
    default:
      // A no-op edit returns the same state: nothing to mark, nothing to write.
      if (data === shell.data || !USER_EDITS.has(action.type)) return { ...shell, data }
      return { ...shell, data, edited: true, dirty: true }
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Deals are saved to this browser's localStorage under the shared policy in
 * `@/lib/persistence`: only after a real edit, validated whole on load,
 * Reset clears the key. Bump the version when the seed or the shape changes.
 */
export const STORAGE_KEY = "hotdash.sales-opportunities.v1"

/**
 * Every deal is checked field by field (see `isDeal`), ids are unique and
 * `nextId` sits above the highest id. Extra keys are allowed through here
 * and dropped by `fromSaved`.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.deals) || !v.deals.every(isDeal)) return false
  if (!isFiniteNumber(v.nextId)) return false
  return dealsAreConsistent(v.deals, v.nextId)
}

export const dealsStorage = createStorage<State>({ key: STORAGE_KEY, validate: isState })

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  const saved = dealsStorage.load(storage).state
  return saved ? fromSaved(saved) : null
}

/** The saved copy, or a fresh seed dated from `nowMs` when there is none. */
export function loadStateOrSeed(storage: Storage | undefined, nowMs: number): State {
  return loadState(storage) ?? initialState(nowMs)
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return dealsStorage.save(storage, state)
}

/**
 * Write only when the serialized copy differs from what the key holds. Two
 * tabs that both hydrate the same copy must not take turns re-writing it.
 * Returns the same boolean `save` does; an identical copy counts as saved.
 */
export function saveIfChanged(storage: Storage | undefined, state: State): boolean {
  if (!storage) return false
  let current: string | null = null
  try {
    current = storage.getItem(STORAGE_KEY)
  } catch {
    // Unreadable storage: fall through and let `save` report the failure.
  }
  if (current !== null && current === JSON.stringify(state)) return true
  return saveState(storage, state)
}

export function clearState(storage: Storage | undefined) {
  dealsStorage.clear(storage)
}

/* --------------------------------------------------------------- provider */

type Store = State &
  PersistenceStore & {
    /**
     * The instant this page measures from: the server's request time, or
     * the moment of the last Reset. Passed in, never read from a client
     * clock, so SSR and hydration agree.
     */
    nowMs: number
    /** `nowMs` as a Central calendar day. */
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
  // Reset regenerates from the moment of the click, so after a Reset the
  // page's "now" is that instant, not the request's.
  const [nowMs, setNowMs] = React.useState(requestNowMs)

  const [{ data: state, hydrated: persisted, edited, saved, saveFailed, dirty }, dispatch] =
    React.useReducer(shellReducer, requestNowMs, (ms) => ({
      data: initialState(ms),
      hydrated: false,
      edited: false,
      saved: false,
      saveFailed: false,
      dirty: false,
    }))

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a layout effect — before the browser paints — so the
  // first visible frame is already the user's data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: dealsStorage.load(window.localStorage), nowMs })
  }, [nowMs])

  // Another tab wrote or cleared the key: take its copy (or, if it Reset,
  // go back to the seed) rather than overwriting it on our next edit.
  React.useEffect(
    () => dealsStorage.subscribe((result) => dispatch({ type: "hydrate", result, nowMs })),
    [nowMs]
  )

  // Write only after a real edit of ours (`dirty`), and only if the copy
  // actually differs from what is stored. A hydrate clears `dirty`, so it
  // can never trigger a write. The result feeds the note: "Saved" only when
  // the write succeeded.
  React.useEffect(() => {
    if (!persisted || !dirty) return
    dispatch({ type: "save-result", ok: saveIfChanged(window.localStorage, state) })
  }, [persisted, dirty, state])

  const value = React.useMemo<Store>(() => {
    const at = new Date(nowMs).toISOString()
    return {
      ...state,
      nowMs,
      today: todayIn(new Date(nowMs)),
      persisted,
      edited,
      saved,
      saveFailed,
      addDeal: (input) => dispatch({ type: "add-deal", input, at }),
      editDeal: (id, input) => dispatch({ type: "edit-deal", id, input, at }),
      setStage: (id, stage) => dispatch({ type: "set-stage", id, stage, at }),
      completeNextStep: (id, nextStep, nextStepDue) =>
        dispatch({ type: "complete-next-step", id, nextStep, nextStepDue, at }),
      deleteDeal: (id) => dispatch({ type: "delete-deal", id }),
      resetDemoData: () => {
        // Clear first, then regenerate from now (the one shared clock): the
        // browser returns to the never-edited state and the seed is dated
        // from this moment, as on Metrics.
        clearState(window.localStorage)
        const ms = now().getTime()
        setNowMs(ms)
        dispatch({ type: "reset", nowMs: ms })
      },
    }
  }, [state, nowMs, persisted, edited, saved, saveFailed])

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>
}

export function useDeals() {
  const ctx = React.useContext(DealsContext)
  if (!ctx) throw new Error("useDeals must be used within a DealsProvider.")
  return ctx
}
