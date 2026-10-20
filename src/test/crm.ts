import { vi } from "vitest"

import { configureCrmSummary } from "@/hooks/use-crm-summary"
import type { CrmMessage, CrmSummary } from "@/lib/crm/types.ours"

export * from "@/test/crm-fixture"

/** Start the rebuilt CRM's store on `summary` (and keep answering it), with `thread` for any case. */
export function setCrmSummaryForTest(summary: CrmSummary, thread: CrmMessage[] = []) {
  configureCrmSummary({
    initial: { phase: "ready", summary },
    fetcher: async () => ({ kind: "ok", data: summary }),
    threadFetcher: async () => ({ kind: "ok", data: thread }),
  })
}

/** Loading, with an answer that never arrives. */
export function setCrmLoadingForTest() {
  configureCrmSummary({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}

/** The login gate answered 401. */
export function setCrmUnauthorizedForTest() {
  configureCrmSummary({
    initial: { phase: "unauthorized" },
    fetcher: async () => ({ kind: "unauthorized" }),
    threadFetcher: async () => ({ kind: "unauthorized" }),
  })
}

/** jsdom has no matchMedia: answer `(min-width: 1280px)` as `desktop`, everything else false. */
export function stubViewport({ desktop }: { desktop: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query.includes("min-width: 1280px"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
