/**
 * Domain model for the Feature Request screen: Dan's raw ideas, before they
 * have a home. Cards move left to right across four columns and the
 * "On Roadmap" column is as far as this page takes them — the Product
 * Roadmap page itself is a later phase.
 */
export type FeatureStatus = "inbox" | "triaged" | "roadmap" | "parked"

export const STATUS_ORDER: readonly FeatureStatus[] = [
  "inbox",
  "triaged",
  "roadmap",
  "parked",
]

export const STATUS_CONFIG: Record<
  FeatureStatus,
  { label: string; description: string }
> = {
  inbox: {
    label: "Inbox",
    description: "Raw. Nobody has looked at it yet.",
  },
  triaged: {
    label: "Triaged",
    description: "Read and understood; waiting on a call.",
  },
  roadmap: {
    label: "On Roadmap",
    description: "Promoted. Belongs on the Product Roadmap.",
  },
  parked: {
    label: "Parked",
    description: "Not now. Kept so it is not lost.",
  },
}

export function isFeatureStatus(value: unknown): value is FeatureStatus {
  return (
    typeof value === "string" && (STATUS_ORDER as readonly string[]).includes(value)
  )
}

export type FeatureRequest = {
  id: string
  title: string
  /** The one-line ask under the title. */
  ask: string
  /** Who raised it. The intake is Dan's, so that is the default. */
  from: string
  status: FeatureStatus
  createdAt: string
  updatedAt: string
  /**
   * True for the invented examples shipped with the page. Cleared the moment
   * the title or ask is rewritten, because at that point the words are the
   * founder's, not ours.
   */
  sample?: boolean
}

export const DEFAULT_FROM = "Dan"

/** Newest first, the order the mock lists each column in. */
export function sortNewestFirst(requests: FeatureRequest[]): FeatureRequest[] {
  return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function byStatus(
  requests: FeatureRequest[],
  status: FeatureStatus
): FeatureRequest[] {
  return sortNewestFirst(requests.filter((r) => r.status === status))
}
