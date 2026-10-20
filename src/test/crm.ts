import { vi } from "vitest"

import { configureCrmSummary } from "@/hooks/use-crm-summary"
import type { CrmMessage, CrmSummary } from "@/lib/crm/case-view"

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

/** Does a viewport `width` px wide match `query`'s min-/max-width parts? */
export function widthMatches(query: string, width: number) {
  const min = /min-width:\s*(\d+)px/.exec(query)
  const max = /max-width:\s*(\d+)px/.exec(query)
  if (!min && !max) return false
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
}

/**
 * jsdom has no matchMedia: answer every width query for a viewport
 * `width` px wide (`desktop` is 1440, the case panel's split view;
 * `desktop: false` is 1024, its modal sheet).
 */
export function stubViewport(viewport: { width: number } | { desktop: boolean }) {
  const width = "width" in viewport ? viewport.width : viewport.desktop ? 1440 : 1024
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: widthMatches(query, width),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
