/**
 * In-memory mock data for the local-only coach dashboard preview. Nothing
 * here talks to an API; the thumbnails are the sample diagrams exported from
 * the Figma file.
 */

export type PlayCardData = {
  id: string
  title: string
  /** Secondary line: relative time, share state, or play count. */
  meta: string
  thumbnail: string
}

export type ToolboxCardData = {
  id: string
  /** Two-line hero title; lines are split on "\n". */
  title: string
  /** Small-caps footer label naming the underlying tool. */
  tool: string
  image: string
  /**
   * Percent geometry of the photo inside its frame, copied from the Figma
   * crop so the visible window matches the design at any card width.
   */
  crop: { width: string; height: string; left: string; top: string }
  /** Optional gradient wash laid over the photo (exported from Figma). */
  overlay?: string
}

export const toolboxCards: ToolboxCardData[] = [
  {
    id: "diagram",
    title: "Diagram\na Play",
    tool: "Diagramming Tool",
    image: "/chlk/hero-diagram.jpg",
    crop: { width: "228.13%", height: "253.19%", left: "-84.05%", top: "-91.28%" },
    overlay: "/chlk/hero-overlay-a.svg",
  },
  {
    id: "film",
    title: "Detail\nthe Film",
    tool: "Telestrator",
    image: "/chlk/hero-film.jpg",
    crop: { width: "106.69%", height: "117.04%", left: "-0.17%", top: "-10.72%" },
  },
  {
    id: "export",
    title: "Send\nDiagram + Film",
    tool: "Export with Media",
    image: "/chlk/hero-export.jpg",
    crop: { width: "176.52%", height: "193.64%", left: "0.09%", top: "-55.48%" },
    overlay: "/chlk/hero-overlay-b.svg",
  },
]

const THUMB_A = "/chlk/thumb-a.png"
const THUMB_B = "/chlk/thumb-b.png"
const THUMB_C = "/chlk/thumb-c.png"

export const recentPlays: PlayCardData[] = [
  { id: "r1", title: "Mesh", meta: "2 hrs ago", thumbnail: THUMB_A },
  { id: "r2", title: "4-Verts", meta: "8 hrs ago", thumbnail: THUMB_B },
  { id: "r3", title: "Drive", meta: "2 days ago", thumbnail: THUMB_A },
  { id: "r4", title: "Y Cross", meta: "Shared out", thumbnail: THUMB_C },
  { id: "r5", title: "Drive", meta: "2 days ago", thumbnail: THUMB_A },
  { id: "r6", title: "Drive", meta: "2 days ago", thumbnail: THUMB_A },
  { id: "r7", title: "Cheeto", meta: "5 plays", thumbnail: THUMB_B },
  { id: "r8", title: "2025 Saints - Yion", meta: "Yesterday", thumbnail: THUMB_B },
  { id: "r9", title: "Drive", meta: "2 days ago", thumbnail: THUMB_A },
  { id: "r10", title: "Drive", meta: "2 days ago", thumbnail: THUMB_A },
  { id: "r11", title: "Cheeto", meta: "5 plays", thumbnail: THUMB_B },
  { id: "r12", title: "2025 Saints - Yion", meta: "Yesterday", thumbnail: THUMB_B },
]

/* ---------------------------------------------------------------------------
 * Playbook Library (Figma 202:1009 — lower band is a raster mock, rebuilt in
 * code): filter chips, folder rows, and unorganized plays.
 * ------------------------------------------------------------------------- */

export const libraryFilters = ["Scheme", "Personnel", "Modified", "Shared"] as const

export type FolderData = {
  id: string
  name: string
  playCount: number
  updated: string
}

export const folders: FolderData[] = [
  { id: "f1", name: "Run Game", playCount: 18, updated: "2 days ago" },
  { id: "f2", name: "Quick Game", playCount: 12, updated: "5 days ago" },
  { id: "f3", name: "Dropback", playCount: 15, updated: "Yesterday" },
  { id: "f4", name: "Screens", playCount: 8, updated: "1 week ago" },
  { id: "f5", name: "3rd Down", playCount: 10, updated: "3 days ago" },
  { id: "f6", name: "Red Zone", playCount: 14, updated: "Yesterday" },
  { id: "f7", name: "2-Minute", playCount: 6, updated: "2 weeks ago" },
  { id: "f8", name: "2025 Saints Install", playCount: 24, updated: "Yesterday" },
]

/** Route shapes drawn by the simplified library thumbnail. */
export type DiagramVariant = "crossers" | "verticals" | "quick"

export type LibraryPlayData = {
  id: string
  title: string
  meta: string
  /** Concept tags printed at the top of the diagram, left and right of the LOS. */
  labels: [string, string]
  diagram: DiagramVariant
  shared?: boolean
}

export const unorganizedPlays: LibraryPlayData[] = [
  { id: "u1", title: "Mesh", meta: "2 hrs ago", labels: ["Shallow Trail", "Glance"], diagram: "crossers" },
  { id: "u2", title: "4-Verts", meta: "8 hrs ago", labels: ["Low Trail", "Glance S"], diagram: "verticals" },
  { id: "u3", title: "Y Cross", meta: "Yesterday", labels: ["Shallow Trail", "Glance"], diagram: "crossers", shared: true },
  { id: "u4", title: "Cheeto", meta: "2 days ago", labels: ["Low Trail", "Glance"], diagram: "verticals" },
  { id: "u5", title: "Quick Out", meta: "3 days ago", labels: ["Quick Out", "Stick"], diagram: "quick" },
  { id: "u6", title: "Dig Seam", meta: "Last week", labels: ["Dig Seam", "Shallow"], diagram: "quick" },
]

export const onePlayADay = {
  date: "Wednesday, Sep 23",
  play: {
    id: "d1",
    title: "Mesh",
    meta: "Today's play",
    thumbnail: THUMB_A,
  } satisfies PlayCardData,
  concept: "Mesh — Shallow Trail / Glance Rail",
  summary:
    "Two shallow crossers rub underneath while the rail stretches the flat defender. Read the mesh point first, then work back to the glance.",
  coachingPoints: [
    "Mesh point sits 5–6 yards deep; the inside receiver sets the depth.",
    "Shallow trail receiver looks for the collision, then flattens.",
    "QB drops to the mesh, eyes the flat defender, works glance late.",
  ],
  streak: 6,
}
