"use client"

import * as React from "react"

import { todayIn, type IsoDay } from "@/lib/clock"
import {
  isSeedScratch,
  isTodo,
  normalizeScratch,
  normalizeTodoInput,
  sameTodo,
  seedTodos,
  SEED_SCRATCH,
  stripTodo,
  TODO_LIMITS,
  todoNumber,
  type Todo,
  type TodoInput,
} from "@/lib/my-desk"
import {
  createStorage,
  dedupe,
  initialShell,
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
  legacyKeys: ["hotdash.my-desk.v1"],
  parse: parseState,
})

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return deskStorage.load(storage).state
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return deskStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  deskStorage.clear(storage)
}

type Store = State &
  PersistenceStore & {
    /**
     * Today on the founder's calendar (America/Chicago), from the shell's
     * clock: the request's instant until a Reset (ours, or another tab's)
     * moves it. The Today date chip and the scratch subtitle derive from
     * it; nothing else in the tree reads a clock for a calendar day.
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
  const today = shellToday(shell)

  // The server has no localStorage, so it renders with `persisted: false`
  // and the page shows skeletons. On the client the saved copy is read in a
  // layout effect — before paint — so the first frame is already the
  // founder's data, never a flash of seed. This first hydrate is the only
  // one dated from the request.
  React.useLayoutEffect(() => {
    if (holdHydration) return
    dispatch({ type: "hydrate", result: deskStorage.load(window.localStorage), nowMs: requestNowMs })
  }, [requestNowMs, holdHydration])

  const onHydrate = React.useCallback(
    (result: LoadResult<State>, hydrateNowMs: number) =>
      dispatch({ type: "hydrate", result, nowMs: hydrateNowMs }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: deskStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today,
      nowMs,
      scratchSample: isSeedScratch(state.scratch),
      persisted,
      edited,
      saved,
      saveFailed,
      addTodo: (input) => dispatch({ type: "add", input, today }),
      updateTodo: (id, input) => dispatch({ type: "update", id, input, today }),
      toggleTodo: (id) => dispatch({ type: "toggle", id, today }),
      removeTodo: (id) => dispatch({ type: "remove", id }),
      restoreTodo: (todo) => dispatch({ type: "restore", todo }),
      setScratch: (text) =>
        dispatch({ type: "set-scratch", text, at: new Date().toISOString() }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }),
    [state, today, nowMs, persisted, edited, saved, saveFailed]
  )

  return <MyDeskContext.Provider value={value}>{children}</MyDeskContext.Provider>
}

export function useMyDesk() {
  const ctx = React.useContext(MyDeskContext)
  if (!ctx) throw new Error("useMyDesk must be used within a MyDeskProvider.")
  return ctx
}
