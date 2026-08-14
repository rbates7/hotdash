import fs from "fs"
import path from "path"
import { HQCard, Comment } from "./types"

const DATA_DIR = path.join(process.cwd(), "data")
const DATA_FILE = path.join(DATA_DIR, "hq-cards.json")

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readCards(): HQCard[] {
  ensureDir()
  if (!fs.existsSync(DATA_FILE)) {
    const seed = buildSeed()
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2))
    return seed
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8")
    return JSON.parse(raw) as HQCard[]
  } catch {
    return []
  }
}

function writeCards(cards: HQCard[]) {
  ensureDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2))
}

function buildSeed(): HQCard[] {
  const now = new Date()
  const ago = (hours: number) =>
    new Date(now.getTime() - hours * 3600 * 1000).toISOString()

  return [
    {
      id: "card-001",
      chlk_key: "CHLK-534",
      title: "Wristband call sheet",
      owner: "Unassigned",
      status: "backlog",
      label: "spike",
      description:
        "Needs a wristband. Explore play-call display options for the wristband hardware interface.",
      estimate_hours: undefined,
      comments: [],
      updated_at: ago(48),
    },
    {
      id: "card-002",
      chlk_key: "CHLK-551",
      title: "Audio note on a play",
      owner: "Unassigned",
      status: "backlog",
      label: undefined,
      description:
        "Voice memo on a drawing play — no owner yet. Coach records a quick audio annotation directly on a play drawing.",
      estimate_hours: undefined,
      comments: [],
      updated_at: ago(36),
    },
    {
      id: "card-003",
      chlk_key: "CHLK-379",
      title: "Shared indicators",
      owner: "Fitz",
      status: "to_do",
      label: "feature",
      description:
        "Add-in slot sharing the same coverage tag across multiple plays so coaches can reuse indicator sets.",
      estimate_hours: 4,
      comments: [],
      updated_at: ago(30),
    },
    {
      id: "card-004",
      chlk_key: "CHLK-349",
      title: "PowerPoint social login",
      owner: "Unassigned",
      status: "to_do",
      label: undefined,
      description:
        "Add-in social login for coaches who aren't already signed in to their Microsoft account inside the add-in context.",
      estimate_hours: undefined,
      comments: [],
      updated_at: ago(20),
    },
    {
      id: "card-005",
      chlk_key: "CHLK-369",
      title: "Coach Network dashboard",
      owner: "Fitz",
      status: "building",
      label: "feature",
      description:
        "Coaches need a home for the people and folders they share with — not another drawing canvas. This card is the profile, the staff list, and the folders a second account can actually open. It sits on the sharing branch; Share a Play is a different ticket and is not shipped. Fitz is in SwiftUI loop 3 of 8 on the staff list.",
      estimate_hours: 11,
      comments: [
        {
          id: "cmt-001",
          author: "Fitz",
          body: "Scaffolded the dashboard from the sharing branch. Estimate is 11h after the folder-permission rewrite.",
          created_at: ago(26),
        },
        {
          id: "cmt-002",
          author: "Mace",
          body: "This is the surface coaches will judge sharing by. Do not call it live until one coach has opened a folder they didn't create.",
          created_at: ago(11),
        },
        {
          id: "cmt-003",
          author: "Simmons",
          body: "PR isn't up yet. Don't merge until the write-into-someone-else's-folder path has a test that a second account can actually open the play.",
          created_at: ago(1),
        },
        {
          id: "cmt-004",
          author: "Mack",
          body: "Blocked on iPad 11 snapshots elsewhere. Can take Coach Network once Play headers goes green — not before.",
          created_at: ago(0.63),
        },
        {
          id: "cmt-005",
          author: "Fitz",
          body: "Loop 3/8 on the SwiftUI staff list. Profile header and shared-folder row are in; the 'who can see this' sheet is still dummy data.",
          created_at: ago(0.07),
        },
      ],
      updated_at: ago(0.07),
    },
    {
      id: "card-006",
      chlk_key: "CHLK-377",
      title: "Pinch scaling",
      owner: "Mack",
      status: "building",
      label: "bug",
      description:
        "Canvas jumps when a coach pinches in on the drawing surface. The scale anchor needs to stay fixed under the midpoint of the gesture.",
      estimate_hours: 2,
      comments: [],
      updated_at: ago(2),
    },
    {
      id: "card-007",
      chlk_key: "CHLK-375",
      title: "Coverage shapes",
      owner: "Simmons",
      status: "review",
      label: "feature",
      description:
        "Profile, shared folders, and quarters coverage shapes. Overlay rendering for zone and man coverage visualization.",
      estimate_hours: 14,
      comments: [],
      updated_at: ago(3),
    },
    {
      id: "card-008",
      chlk_key: "CHLK-376",
      title: "Play headers",
      owner: "Mace",
      status: "review",
      label: "bug",
      description:
        "On TestFlight for testers — two iPad 11 snapshots diverging. Header layout breaks on certain iPad Pro screen sizes.",
      estimate_hours: 2,
      comments: [],
      updated_at: ago(4),
    },
    {
      id: "card-009",
      chlk_key: "CHLK-321",
      title: "MaxPreps lead scrape",
      owner: "Radcliffe",
      status: "done",
      label: "chore",
      description:
        "News and lifetime programs screened. MaxPreps data pipeline for lead generation and program filtering complete.",
      estimate_hours: 4,
      comments: [],
      updated_at: ago(72),
    },
  ]
}

export function getAllCards(): HQCard[] {
  return readCards()
}

export function getCardById(id: string): HQCard | null {
  const cards = readCards()
  return cards.find((c) => c.id === id) ?? null
}

export function updateCard(
  id: string,
  patch: Record<string, unknown>
): HQCard | null {
  const cards = readCards()
  const idx = cards.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const updated = { ...cards[idx], updated_at: new Date().toISOString() }

  for (const [key, val] of Object.entries(patch)) {
    if (val === null || val === undefined) {
      // null/undefined clears optional fields
      delete (updated as Record<string, unknown>)[key]
    } else {
      (updated as Record<string, unknown>)[key] = val
    }
  }

  cards[idx] = updated as HQCard
  writeCards(cards)
  return cards[idx]
}

export function appendComment(
  id: string,
  author: string,
  body: string
): HQCard | null {
  const cards = readCards()
  const idx = cards.findIndex((c) => c.id === id)
  if (idx === -1) return null
  const comment: Comment = {
    id: `cmt-${Date.now()}`,
    author,
    body,
    created_at: new Date().toISOString(),
  }
  cards[idx] = {
    ...cards[idx],
    comments: [...cards[idx].comments, comment],
    updated_at: new Date().toISOString(),
  }
  writeCards(cards)
  return cards[idx]
}
