import "server-only"

/**
 * A background sync that runs out of time. Its `type` and class name are
 * fixed words, so each source's `failureKind` logs it as such.
 */
export class SyncTimeoutError extends Error {
  readonly type = "SyncTimeout"
  constructor() {
    super("sync timed out")
    this.name = "SyncTimeoutError"
  }
}

/**
 * Background syncs give up after this — under the routes' `maxDuration`
 * (300 s), so a sync kept alive by `after()` is never cut off mid-write.
 */
export const SYNC_TIMEOUT_MS = 240_000

/**
 * `work`, or a `SyncTimeoutError` after `ms`. The signal is aborted on
 * timeout for loaders that can stop early; one that cannot keeps running,
 * but its answer is ignored (a late rejection is handled, never unhandled).
 */
export function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new SyncTimeoutError())
    }, ms)
  })
  return Promise.race([work(controller.signal), timeout]).finally(() => clearTimeout(timer))
}
