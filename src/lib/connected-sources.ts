/**
 * Settings › Connected data. Each source reports one of three states, read
 * from its health route. A source without a live health route is "needs_setup"
 * — never a made-up "connected".
 */
export type SourceState = "connected" | "not_connected" | "needs_setup"

export type SourceName = "Stripe" | "App Store" | "PostHog" | "Notion" | "Gmail" | "Sentry"

export interface ConnectedSource {
  name: SourceName
  feeds: string
  /** Health route path, or null while no route exists yet. */
  healthRoute: string | null
}

export const CONNECTED_SOURCES: readonly ConnectedSource[] = [
  { name: "Stripe", feeds: "Subscribers, revenue, churn, trials", healthRoute: "/api/health/stripe" },
  { name: "App Store", feeds: "App Store subscribers and trials", healthRoute: null },
  { name: "PostHog", feeds: "Usage, active coaches, funnels", healthRoute: null },
  { name: "Notion", feeds: "Product roadmap", healthRoute: null },
  { name: "Gmail", feeds: "Coach conversations for CRM", healthRoute: null },
  { name: "Sentry", feeds: "Errors, crash-free rate, bugs", healthRoute: null },
]

export const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  needs_setup: "Needs setup",
}

/** Map a health route's answer ("ok" | "unavailable" | "not_configured") to a state. */
export function stateFromHealth(health: string | null | undefined, hasRoute: boolean): SourceState {
  if (!hasRoute) return "needs_setup"
  if (health === "ok") return "connected"
  if (health === "not_configured") return "not_connected"
  return "needs_setup"
}
