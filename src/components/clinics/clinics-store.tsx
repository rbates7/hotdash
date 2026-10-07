"use client"

import * as React from "react"

import { todayIn, type IsoDay } from "@/lib/clock"
import {
  clinicNumber,
  isClinic,
  normalizeInput,
  sameClinic,
  seedClinics,
  stripClinic,
  type Attendance,
  type Clinic,
  type ClinicInput,
} from "@/lib/clinics"
import {
  createStorage,
  dedupe,
  isFiniteNumber,
  type LoadResult,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

/**
 * What is saved. Deliberately no clock in here: `today` belongs to the
 * request, never to the copy, so two tabs serialise the same edits to the
 * same bytes and a hydrate can be compared against storage verbatim.
 */
export type State = {
  clinics: Clinic[]
  /** Next number for a generated clinic-n id. */
  nextId: number
}

export type Action =
  | { type: "add"; input: ClinicInput }
  | { type: "update"; id: string; input: ClinicInput }
  | { type: "set-attendance"; id: string; attendance: Attendance }
  | { type: "remove"; id: string }
  | { type: "hydrate"; result: LoadResult<State>; today: IsoDay }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; today: IsoDay }

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const clinic: Clinic = { id: `clinic-${state.nextId}`, ...normalizeInput(action.input) }
      return { ...state, clinics: [...state.clinics, clinic], nextId: state.nextId + 1 }
    }

    case "update": {
      const current = state.clinics.find((c) => c.id === action.id)
      if (!current) return state
      const next: Clinic = { id: current.id, ...normalizeInput(action.input) }
      if (sameClinic(current, next)) return state
      return { ...state, clinics: state.clinics.map((c) => (c.id === action.id ? next : c)) }
    }

    case "set-attendance": {
      const current = state.clinics.find((c) => c.id === action.id)
      if (!current || current.attendance === action.attendance) return state
      return {
        ...state,
        clinics: state.clinics.map((c) =>
          c.id === action.id ? { ...c, attendance: action.attendance } : c
        ),
      }
    }

    case "remove":
      if (!state.clinics.some((c) => c.id === action.id)) return state
      return { ...state, clinics: state.clinics.filter((c) => c.id !== action.id) }

    case "hydrate":
      // A saved copy replaces ours whole; an empty or removed key (a Reset
      // in another tab, or nothing saved yet) puts this tab back on the seed.
      return action.result.state ? stripState(action.result.state) : initialState(action.today)

    case "save-result":
      return state

    case "reset":
      return initialState(action.today)
  }
}

/** Actions that are the founder's own edits, as opposed to plumbing. */
const USER_EDITS = new Set<Action["type"]>(["add", "update", "set-attendance", "remove"])

/**
 * Reducer state plus persistence bookkeeping (`PersistenceStatus`): whether
 * localStorage has been consulted, whether the founder changed something
 * this session, whether the key holds a copy, and whether the last write
 * failed.
 */
type Shell = {
  data: State
  hydrated: boolean
  edited: boolean
  saved: boolean
  saveFailed: boolean
}

export function shellReducer(shell: Shell, action: Action): Shell {
  const data = reducer(shell.data, action)
  switch (action.type) {
    case "hydrate":
      // Whatever arrived is already in storage (or storage is empty), so
      // there is nothing of ours to write: `edited` goes back to false and
      // the save effect stays quiet. This is what stops two tabs trading
      // writes forever.
      return {
        data,
        hydrated: true,
        edited: false,
        saved: action.result.status === "saved",
        saveFailed: false,
      }
    case "save-result":
      return { ...shell, saved: action.ok ? true : shell.saved, saveFailed: !action.ok }
    case "reset":
      return { data, hydrated: shell.hydrated, edited: false, saved: false, saveFailed: false }
    default:
      // A no-op edit (same values saved again) leaves the shell untouched,
      // so nothing re-renders and nothing is written.
      if (data === shell.data) return shell
      return { ...shell, data, edited: shell.edited || USER_EDITS.has(action.type) }
  }
}

/** The seed, four clinics ahead of `today` and four behind it. */
export function initialState(today: IsoDay): State {
  const clinics = seedClinics(today)
  return { clinics, nextId: highestId(clinics) + 1 }
}

/** The highest numeric suffix among clinic-n ids; 0 when there are none. */
function highestId(clinics: readonly Clinic[]) {
  return clinics.reduce((max, c) => Math.max(max, clinicNumber(c.id)), 0)
}

/* ------------------------------------------------------------ persistence */

/**
 * Clinics are saved to this browser's localStorage under the shared policy
 * in `@/lib/persistence`: only after a real edit, validated whole on load,
 * Reset clears the key. Bump the version when the seed or shape changes.
 */
export const STORAGE_KEY = "hotdash.clinics.v1"

/**
 * Every row is checked, not just the envelope: a bad type, an impossible
 * date, a duplicate id or an id counter that would collide all drop the
 * copy for the seed.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.clinics) || !v.clinics.every(isClinic)) return false
  if (dedupe(v.clinics.map((c) => c.id)).length !== v.clinics.length) return false
  if (!isFiniteNumber(v.nextId) || !Number.isInteger(v.nextId)) return false
  if (v.nextId <= highestId(v.clinics)) return false
  return true
}

/** Known keys only, at both levels; a saved copy's extras stop here. */
export function stripState(state: State): State {
  return { clinics: state.clinics.map(stripClinic), nextId: state.nextId }
}

export const clinicsStorage = createStorage<State>({ key: STORAGE_KEY, validate: isState })

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  const saved = clinicsStorage.load(storage).state
  return saved ? stripState(saved) : null
}

/** The saved copy, or a fresh seed around `today` when there is none. */
export function loadStateOrSeed(storage: Storage | undefined, today: IsoDay): State {
  return loadState(storage) ?? initialState(today)
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return clinicsStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  clinicsStorage.clear(storage)
}

/**
 * Whether `state` serialises to exactly what the key already holds. The
 * save effect skips the write when it does — a hydrate from another tab
 * followed by an identical re-save must not echo back.
 */
export function matchesStored(storage: Storage | undefined, state: State) {
  try {
    return storage?.getItem(STORAGE_KEY) === JSON.stringify(state)
  } catch {
    return false
  }
}

type Store = State &
  PersistenceStore & {
    /**
     * Today on the founder's calendar (America/Chicago), from the one clock
     * reading the page made. Upcoming/Past and "in N days" all derive from it;
     * nothing in the tree reads the machine clock.
     */
    today: IsoDay
    addClinic: (input: ClinicInput) => void
    updateClinic: (id: string, input: ClinicInput) => void
    setAttendance: (id: string, attendance: Attendance) => void
    removeClinic: (id: string) => void
  }

const ClinicsContext = React.createContext<Store | null>(null)

export function ClinicsProvider({
  nowMs,
  children,
}: {
  /** `now().getTime()` from the server component rendering this page. */
  nowMs: number
  children: React.ReactNode
}) {
  const today = React.useMemo(() => todayIn(new Date(nowMs)), [nowMs])

  const [{ data: state, hydrated: persisted, edited, saved, saveFailed }, dispatch] =
    React.useReducer(shellReducer, today, (day) => ({
      data: initialState(day),
      hydrated: false,
      edited: false,
      saved: false,
      saveFailed: false,
    }))

  // The server has no localStorage, so it renders with `persisted: false`
  // and the page shows skeletons. On the client the saved copy is read in a
  // layout effect — before paint — so the first frame is already the
  // founder's data, never a flash of seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: clinicsStorage.load(window.localStorage), today })
  }, [today])

  // Another tab wrote or cleared the key: take its copy (or go back to the
  // seed) rather than overwriting it with ours on the next edit.
  React.useEffect(
    () => clinicsStorage.subscribe((result) => dispatch({ type: "hydrate", result, today })),
    [today]
  )

  // Write only after a real edit, and only when the bytes would change. A
  // visit that changes nothing leaves storage untouched; a hydrate never
  // writes (it clears `edited`); an edit that lands on what is already
  // stored is skipped. The result feeds the note: "Saved" only on success.
  React.useEffect(() => {
    if (!persisted || !edited) return
    if (matchesStored(window.localStorage, state)) return
    dispatch({ type: "save-result", ok: saveState(window.localStorage, state) })
  }, [persisted, edited, state])

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today,
      persisted,
      edited,
      saved,
      saveFailed,
      addClinic: (input) => dispatch({ type: "add", input }),
      updateClinic: (id, input) => dispatch({ type: "update", id, input }),
      setAttendance: (id, attendance) => dispatch({ type: "set-attendance", id, attendance }),
      removeClinic: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        // Clear first, then regenerate around the page's day: the browser
        // returns to the never-edited state and other tabs hear the clear.
        clearState(window.localStorage)
        dispatch({ type: "reset", today })
      },
    }),
    [state, today, persisted, edited, saved, saveFailed]
  )

  return <ClinicsContext.Provider value={value}>{children}</ClinicsContext.Provider>
}

export function useClinics() {
  const ctx = React.useContext(ClinicsContext)
  if (!ctx) throw new Error("useClinics must be used within a ClinicsProvider.")
  return ctx
}
