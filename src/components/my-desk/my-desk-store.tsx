"use client"

import * as React from "react"

import { now, todayIn, type IsoDay } from "@/lib/clock"
import {
  isSeedScratch,
  isTodo,
  msUntilNextCentralMidnight,
  normalizeScratch,
  normalizeTodoInput,
  sameTodo,
  seedTodos,
  SEED_SCRATCH,
  stripTodo,
  TODO_ID,
  TODO_LIMITS,
  todoNumber,
  type Todo,
  type TodoInput,
} from "@/lib/my-desk"
import {
  createStorage,
  dedupe,
  initialShell,
  isBoolean,
  isFiniteNumber,
  isIsoInstant,
  isString,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

/**
 * What is saved. Deliberately no "today" in here: the date chip belongs to
 * the request, never to the copy, so two tabs serialise the same edits to
 * the same bytes and the shared `save` can skip an identical write.
 * `scratchUpdatedAt` is the instant the scratch last changed — a real
 * timestamp, not the page clock — so "Saved 5m ago" survives a reload.
 */
export type State = {
  todos: Todo[]
  /** Next number for a generated todo-n id. */
  nextId: number
  scratch: string
  scratchUpdatedAt: string
}

export type Action =
  | { type: "add"; input: TodoInput; today: IsoDay }
  | { type: "update"; id: string; input: TodoInput; today: IsoDay }
  | { type: "toggle"; id: string; today: IsoDay }
  | { type: "remove"; id: string }
  | { type: "restore"; todo: Todo }
  | { type: "set-scratch"; text: string; at: string }
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; nowMs: number }

/** The founder's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

/** The list's own transitions. Returns its input for a no-op, as the shared shell requires. */
export function reducer(state: State, action: EditAction): State {
  switch (action.type) {
    case "add": {
      const input = normalizeTodoInput(action.input)
      if (!input.title) return state
      const todo: Todo = {
        id: `todo-${state.nextId}`,
        ...input,
        createdOn: action.today,
        doneOn: input.done ? action.today : null,
      }
      return { ...state, todos: [...state.todos, todo], nextId: state.nextId + 1 }
    }

    case "update": {
      const current = state.todos.find((t) => t.id === action.id)
      if (!current) return state
      const input = normalizeTodoInput(action.input)
      const next: Todo = {
        id: current.id,
        ...input,
        createdOn: current.createdOn,
        doneOn: input.done ? (current.done ? current.doneOn : action.today) : null,
      }
      if (!next.title || sameTodo(current, next)) return state
      return { ...state, todos: state.todos.map((t) => (t.id === action.id ? next : t)) }
    }

    case "toggle": {
      const current = state.todos.find((t) => t.id === action.id)
      if (!current) return state
      const done = !current.done
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, done, doneOn: done ? action.today : null } : t
        ),
      }
    }

    case "remove":
      if (!state.todos.some((t) => t.id === action.id)) return state
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) }

    case "restore": {
      if (state.todos.some((t) => t.id === action.todo.id)) return state
      if (!isTodo(action.todo)) return state
      const todo = stripTodo(action.todo)
      const nextId = Math.max(state.nextId, todoNumber(todo.id) + 1)
      return { ...state, todos: [...state.todos, todo], nextId }
    }

    case "set-scratch": {
      const scratch = normalizeScratch(action.text)
      if (scratch === state.scratch) return state
      if (!isIsoInstant(action.at)) return state
      return { ...state, scratch, scratchUpdatedAt: action.at }
    }
  }
}

type Shell = PersistenceShell<State>

/** The calendar day a shell measures from (America/Chicago). */
export const shellToday = (shell: Pick<Shell, "nowMs">): IsoDay => todayIn(new Date(shell.nowMs))

/** The seed around the instant `nowMs` falls on. */
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

/** The seed: the mock's seven to-dos and one scratch note, dated from `nowMs`. */
export function initialState(nowMs: number): State {
  const todos = seedTodos(todayIn(new Date(nowMs)))
  return {
    todos,
    nextId: highestId(todos) + 1,
    scratch: SEED_SCRATCH,
    scratchUpdatedAt: new Date(nowMs).toISOString(),
  }
}

/** The highest numeric suffix among todo-n ids; 0 when there are none. */
function highestId(todos: readonly Todo[]) {
  return todos.reduce((max, t) => Math.max(max, todoNumber(t.id)), 0)
}

/* ------------------------------------------------------------ persistence */

/**
 * My Desk is saved to this browser's localStorage under the shared policy
 * in `@/lib/persistence`: only after a real edit, validated whole on load,
 * Reset clears the key. Bump the version when the seed or shape changes.
 */
export const STORAGE_KEY = "hotdash.my-desk.v2"
export const LEGACY_KEY = "hotdash.my-desk.v1"

/**
 * Every row is checked, not just the envelope: a bad type, a blank title,
 * a duplicate id or an id counter that would collide all drop the copy
 * for the seed.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.todos) || !v.todos.every(isTodo)) return false
  if (dedupe(v.todos.map((t) => t.id)).length !== v.todos.length) return false
  if (!isFiniteNumber(v.nextId) || !Number.isInteger(v.nextId)) return false
  if (v.nextId <= highestId(v.todos)) return false
  if (!isString(v.scratch) || v.scratch.length > TODO_LIMITS.scratch) return false
  if (!isIsoInstant(v.scratchUpdatedAt)) return false
  return true
}

/** Known keys only, at both levels; a saved copy's extras stop here. */
export function stripState(state: State): State {
  return {
    todos: state.todos.map(stripTodo),
    nextId: state.nextId,
    scratch: state.scratch,
    scratchUpdatedAt: state.scratchUpdatedAt,
  }
}

/** The storage `parse`: validate every row, then keep only the known keys. */
export function parseState(value: unknown): State | null {
  return isState(value) ? stripState(value) : null
}

export const deskStorage = createStorage<State>({
  key: STORAGE_KEY,
  legacyKeys: [LEGACY_KEY],
  parse: parseState,
})

/** The v1 row: id, title, note, done. Dates were added in v2. */
export type V1Todo = Pick<Todo, "id" | "title" | "note" | "done">

/** The v1 envelope; same counters and scratch, no calendar days. */
export type V1State = {
  todos: V1Todo[]
  nextId: number
  scratch: string
  scratchUpdatedAt: string
}

const isText = (v: unknown, max: number): v is string => isString(v) && v.length <= max

function isV1Todo(value: unknown): value is V1Todo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    TODO_ID.test(v.id) &&
    isText(v.title, TODO_LIMITS.title) &&
    v.title.trim().length > 0 &&
    isText(v.note, TODO_LIMITS.note) &&
    isBoolean(v.done)
  )
}

/** The old row guard: every field, then only the known keys. */
export function parseV1(value: unknown): V1State | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.todos) || !v.todos.every(isV1Todo)) return null
  if (dedupe(v.todos.map((t) => t.id)).length !== v.todos.length) return null
  if (!isFiniteNumber(v.nextId) || !Number.isInteger(v.nextId)) return null
  if (v.nextId <= v.todos.reduce((max, t) => Math.max(max, todoNumber(t.id)), 0)) return null
  if (!isString(v.scratch) || v.scratch.length > TODO_LIMITS.scratch) return null
  if (!isIsoInstant(v.scratchUpdatedAt)) return null
  return {
    todos: v.todos.map((t) => ({ id: t.id, title: t.title, note: t.note, done: t.done })),
    nextId: v.nextId,
    scratch: v.scratch,
    scratchUpdatedAt: v.scratchUpdatedAt,
  }
}

export const legacyDesk = createStorage<V1State>({
  key: LEGACY_KEY,
  parse: parseV1,
})

/**
 * Stamp each v1 row with the request's Central day so it does not look
 * carried-over on the first visit after the shape change. Ids, nextId,
 * scratch and scratchUpdatedAt stay as they were.
 */
export function migrateV1(v1: V1State, today: IsoDay): State | null {
  const state: State = {
    todos: v1.todos.map((t) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      done: t.done,
      createdOn: today,
      doneOn: t.done ? today : null,
    })),
    nextId: v1.nextId,
    scratch: v1.scratch,
    scratchUpdatedAt: v1.scratchUpdatedAt,
  }
  return isState(state) ? stripState(state) : null
}

/**
 * v2 wins whenever it exists (saved, rejected or error). Otherwise a valid
 * v1 is migrated in memory. Loading writes nothing.
 */
export function loadDesk(storage: Storage | undefined, nowMs: number): LoadResult<State> {
  const v2 = deskStorage.load(storage)
  if (v2.status !== "empty") return v2
  const v1 = legacyDesk.load(storage)
  if (v1.status === "saved" && v1.state) {
    const migrated = migrateV1(v1.state, todayIn(new Date(nowMs)))
    if (migrated) return { status: "saved", state: migrated }
  }
  return { state: null, status: "empty" }
}

/** Read the v2 copy only; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return deskStorage.load(storage).state
}

function parkRejectedV1(storage: Storage | undefined) {
  const v1 = legacyDesk.load(storage)
  if (v1.status === "rejected") legacyDesk.quarantine(storage, v1.rejected)
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  parkRejectedV1(storage)
  return deskStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  deskStorage.clear(storage)
  legacyDesk.clear(storage)
}

type Store = State &
  PersistenceStore & {
    /**
     * Today on the founder's calendar (America/Chicago). First render uses
     * the request instant (hydration-safe). After mount it re-reads
     * `todayIn(now())` on focus, on becoming visible, and at the next
     * Central midnight, so a tab left open overnight stamps and filters
     * against the new day.
     */
    today: IsoDay
    /** The shell clock, for "Saved 5m ago" on the scratch note. */
    nowMs: number
    scratchSample: boolean
    addTodo: (input: TodoInput) => void
    updateTodo: (id: string, input: TodoInput) => void
    toggleTodo: (id: string) => void
    removeTodo: (id: string) => void
    restoreTodo: (todo: Todo) => void
    setScratch: (text: string) => void
  }

const MyDeskContext = React.createContext<Store | null>(null)

export function MyDeskProvider({
  nowMs: requestNowMs,
  holdHydration = false,
  children,
}: {
  /** `now().getTime()` from the server component — the one clock read for the first hydrate. */
  nowMs: number
  /**
   * Screenshot-only: skip reading localStorage so the page stays on the
   * loading skeleton. Production visits never pass this.
   */
  holdHydration?: boolean
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, (ms) =>
    initialShell(seedAt(ms), ms)
  )
  const { data: state, persisted, edited, saved, saveFailed, nowMs } = shell
  const [day, setDay] = React.useState(() => todayIn(new Date(requestNowMs)))

  const refreshDay = React.useCallback(() => {
    const next = todayIn(now())
    setDay((prev) => (prev === next ? prev : next))
  }, [])

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshDay()
    }
    const onFocus = () => refreshDay()
    let timer = 0
    const arm = () => {
      const wait = msUntilNextCentralMidnight(now())
      timer = window.setTimeout(() => {
        refreshDay()
        arm()
      }, Math.max(wait, 1))
    }
    arm()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshDay])

  // The server has no localStorage, so it renders with `persisted: false`
  // and the page shows skeletons. On the client the saved copy is read in a
  // layout effect — before paint — so the first frame is already the
  // founder's data, never a flash of seed. This first hydrate is the only
  // one dated from the request. v1 is migrated in memory; nothing is written.
  React.useLayoutEffect(() => {
    if (holdHydration) return
    dispatch({ type: "hydrate", result: loadDesk(window.localStorage, requestNowMs), nowMs: requestNowMs })
  }, [requestNowMs, holdHydration])

  const onHydrate = React.useCallback(
    (result: LoadResult<State>, hydrateNowMs: number) => {
      dispatch({ type: "hydrate", result, nowMs: hydrateNowMs })
      // Another tab's Reset (no copy) reseeds from `now()`; move the
      // calendar day with that instant so the chip and stamps match.
      if (result.state === null) setDay(todayIn(new Date(hydrateNowMs)))
    },
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  const persistence = React.useMemo(
    () => ({ ...deskStorage, save: saveState, clear: clearState }),
    []
  )
  usePersistenceSync({ storage: persistence, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today: day,
      nowMs,
      scratchSample: isSeedScratch(state.scratch),
      persisted,
      edited,
      saved,
      saveFailed,
      addTodo: (input) => dispatch({ type: "add", input, today: day }),
      updateTodo: (id, input) => dispatch({ type: "update", id, input, today: day }),
      toggleTodo: (id) => dispatch({ type: "toggle", id, today: day }),
      removeTodo: (id) => dispatch({ type: "remove", id }),
      restoreTodo: (todo) => dispatch({ type: "restore", todo }),
      setScratch: (text) =>
        dispatch({ type: "set-scratch", text, at: new Date().toISOString() }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
        setDay(todayIn(now()))
      },
    }),
    [state, day, nowMs, persisted, edited, saved, saveFailed]
  )

  return <MyDeskContext.Provider value={value}>{children}</MyDeskContext.Provider>
}

export function useMyDesk() {
  const ctx = React.useContext(MyDeskContext)
  if (!ctx) throw new Error("useMyDesk must be used within a MyDeskProvider.")
  return ctx
}
