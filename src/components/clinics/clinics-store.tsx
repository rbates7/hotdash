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
  initialShell,
  isFiniteNumber,
  persistenceShellReducer,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

/**
 * What is saved. Deliberately no clock in here: `today` belongs to the
 * request, never to the copy, so two tabs serialise the same edits to the
 * same bytes and the shared `save` can skip an identical write.
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

/** The founder's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

/** The list's own transitions. Returns its input for a no-op, as the shared shell requires. */
export function reducer(state: State, action: EditAction): State {
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
  }
}

/**
 * The shared persistence shell around the list. A saved copy replaces ours
 * whole; an empty or removed key (nothing saved yet, or a Reset in another
 * tab) puts this tab back on the seed around the request's day. Everything
 * else — hydrates never write, no-op edits are identity, `saved` follows
 * the write's result — is the shared reducer's business.
 */
type Shell = PersistenceShell<State>

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        fallback: initialState(action.today),
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", data: initialState(action.today) })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
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

/** The storage `parse`: validate every row, then keep only the known keys. */
export function parseState(value: unknown): State | null {
  return isState(value) ? stripState(value) : null
}

export const clinicsStorage = createStorage<State>({ key: STORAGE_KEY, parse: parseState })

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return clinicsStorage.load(storage).state
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

  const [shell, dispatch] = React.useReducer(shellReducer, today, (day) =>
    initialShell(initialState(day))
  )
  const { data: state, persisted, edited, saved, saveFailed } = shell

  // The server has no localStorage, so it renders with `persisted: false`
  // and the page shows skeletons. On the client the saved copy is read in a
  // layout effect — before paint — so the first frame is already the
  // founder's data, never a flash of seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: clinicsStorage.load(window.localStorage), today })
  }, [today])

  // Other tabs and writes, the shared way: a hydrate never writes; only a
  // moving edit count does, and an identical copy is skipped by `save`.
  const onHydrate = React.useCallback(
    (result: LoadResult<State>) => dispatch({ type: "hydrate", result, today }),
    [today]
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: clinicsStorage, shell, onHydrate, onSaved })

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
        // Clear first, then regenerate around the request's day — never a
        // client clock read, per the read-once rule. Other tabs hear the
        // clear and re-seed too.
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
