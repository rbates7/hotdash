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

export type PlaybookData = {
  id: string
  name: string
  playCount: number
  updated: string
  thumbnail: string
}

export const playbooks: PlaybookData[] = [
  { id: "p1", name: "2025 Saints - Yion", playCount: 24, updated: "Yesterday", thumbnail: THUMB_B },
  { id: "p2", name: "Red Zone Install", playCount: 12, updated: "3 days ago", thumbnail: THUMB_A },
  { id: "p3", name: "Two-Minute Drill", playCount: 8, updated: "Last week", thumbnail: THUMB_C },
  { id: "p4", name: "Cheeto", playCount: 5, updated: "Last week", thumbnail: THUMB_B },
  { id: "p5", name: "Spring Ball Concepts", playCount: 31, updated: "2 weeks ago", thumbnail: THUMB_A },
  { id: "p6", name: "Air Raid Base", playCount: 16, updated: "Last month", thumbnail: THUMB_C },
  { id: "p7", name: "Screens + RPOs", playCount: 9, updated: "Last month", thumbnail: THUMB_A },
  { id: "p8", name: "Goal Line", playCount: 6, updated: "Aug 2025", thumbnail: THUMB_B },
]

export type TutorialData = {
  id: string
  title: string
  duration: string
  thumbnail: string
}

export const tutorials: TutorialData[] = [
  { id: "t1", title: "Diagram your first play", duration: "3:42", thumbnail: THUMB_A },
  { id: "t2", title: "Telestrator basics", duration: "5:10", thumbnail: THUMB_B },
  { id: "t3", title: "Sync a diagram to film", duration: "4:05", thumbnail: THUMB_C },
  { id: "t4", title: "Export with media", duration: "2:36", thumbnail: THUMB_A },
  { id: "t5", title: "Organize a playbook", duration: "3:18", thumbnail: THUMB_B },
  { id: "t6", title: "Share with your staff", duration: "1:58", thumbnail: THUMB_C },
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
