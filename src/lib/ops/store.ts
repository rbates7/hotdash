import fs from "fs"
import path from "path"
import { OpsCard, OpsComment } from "./types"

const DATA_DIR = path.join(process.cwd(), "data")
const DATA_FILE = path.join(DATA_DIR, "ops-cards.json")

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readCards(): OpsCard[] {
  ensureDir()
  if (!fs.existsSync(DATA_FILE)) {
    const seed = buildSeed()
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2))
    return seed
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as OpsCard[]
  } catch {
    return []
  }
}

function writeCards(cards: OpsCard[]) {
  ensureDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2))
}

function buildSeed(): OpsCard[] {
  const now = new Date()
  const ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString()

  return [
    // TO DO
    {
      id: "ops-001",
      title: "Aledo HS personal call",
      owner: "Skye",
      status: "to_do",
      description:
        "12 seats, trial ends Friday — gone quiet since the demo. Personal call before the trial lapses; do not let it churn silently.",
      comments: [
        { id: "oc-001", author: "Skye", body: "Reached out twice by email. No reply. Scheduling a call for Thursday.", created_at: ago(20) },
        { id: "oc-002", author: "May", body: "If no answer by EOD Thursday, flag for Rashad.", created_at: ago(4) },
      ],
      updated_at: ago(4),
    },
    {
      id: "ops-002",
      title: "Staff-seat invoice follow-up",
      owner: "May",
      status: "to_do",
      description:
        "172 purchased seats never activated — charges are live but coaches haven't set passwords. Invoice dispute risk.",
      comments: [
        { id: "oc-003", author: "May", body: "Sent the activation guide to the AD. Waiting on confirmation.", created_at: ago(30) },
        { id: "oc-004", author: "Hunter", body: "Check if their IT blocked the invite emails.", created_at: ago(10) },
      ],
      updated_at: ago(10),
    },
    {
      id: "ops-003",
      title: "Clinic booth rates, spring 2027",
      owner: "Coulson",
      status: "to_do",
      description:
        "Booth pricing for spring clinics — inventory and logistics needed before rate card goes out.",
      comments: [
        { id: "oc-005", author: "Coulson", body: "Draft rate card is in Notion. Needs review from Rashad before sending.", created_at: ago(48) },
      ],
      updated_at: ago(48),
    },

    // IN PROGRESS
    {
      id: "ops-004",
      title: "Oklahoma follow-up sequence",
      owner: "Hunter",
      status: "in_progress",
      description:
        "Drafting the next Explee list off the scrape — Oklahoma programs scored into the sequence queue.",
      comments: [
        { id: "oc-006", author: "Hunter", body: "List is built. Sequence draft is in Explee — waiting on copy approval.", created_at: ago(15) },
        { id: "oc-007", author: "Trip", body: "Copy looks good. Approve and schedule.", created_at: ago(3) },
      ],
      updated_at: ago(3),
    },
    {
      id: "ops-005",
      title: "Katy HS trial-end follow-up",
      owner: "Ward",
      status: "in_progress",
      description:
        "Coach Delgado, 4 seats, trial ended Aug 1. High-touch follow-up — this is a district account.",
      comments: [
        { id: "oc-008", author: "Ward", body: "Called Coach Delgado. Left voicemail. Emailed with the renewal deck.", created_at: ago(24) },
        { id: "oc-009", author: "May", body: "If no response by Friday, escalate to district AD.", created_at: ago(6) },
      ],
      updated_at: ago(6),
    },

    // BLOCKED
    {
      id: "ops-006",
      title: "Texas sequence waiting on Rashad",
      owner: "Trip",
      status: "blocked",
      description:
        "Largest single send yet and the push for Aug 15. 1,840 Texas high school coaches are queued in Explee, same template as sequence 3. Volume is above the 500-per-send ceiling. Reply rate held at 3.1% across the last three sequences. The MaxPreps scrape filled the list — that scrape is inventory, not permission to send. Stays blocked until Rashad says yes.",
      blocker_reason: "Rashad hasn't approved the 1,840–coach send",
      comments: [
        { id: "oc-010", author: "Trip", body: "Sequence is built in Explee. 1,840 Texas HS coaches, same template as sequence 3. Sitting behind the 500-per-send ceiling until Rashad says yes.", created_at: ago(72) },
        { id: "oc-011", author: "May", body: "This is the push for Aug 15. I will not move it to in progress without a yes. Put the reason on the card.", created_at: ago(48) },
        { id: "oc-012", author: "Hunter", body: "Reply rate on the last three was 3.1%. Expected ~57 replies. I can split into four sends under 500 if that's the path — still needs the yes.", created_at: ago(36) },
        { id: "oc-013", author: "Rashad", body: "Do not send Texas on the back of the MaxPreps scrape. The list is inventory. I have not approved this send.", created_at: ago(10) },
        { id: "oc-014", author: "Trip", body: "Still blocked. Reason is on the card: Rashad hasn't approved the 1,840–coach send.", created_at: ago(0.37) },
      ],
      updated_at: ago(0.37),
    },
    {
      id: "ops-007",
      title: "Bishop Lynch refund",
      owner: "Skye",
      status: "blocked",
      description:
        "Refund request for Bishop Lynch — above the auto-refund ceiling. Amount requires manual approval before processing.",
      blocker_reason: "Above auto-refund ceiling, needs a yes",
      comments: [
        { id: "oc-015", author: "Skye", body: "Refund is $840. Auto-refund cap is $500. Needs Rashad or May to approve.", created_at: ago(18) },
        { id: "oc-016", author: "May", body: "Confirm the amount with the AD first. Do not process until verified.", created_at: ago(8) },
        { id: "oc-017", author: "Skye", body: "AD confirmed $840. Waiting on approval to process.", created_at: ago(2) },
      ],
      updated_at: ago(2),
    },

    // DONE
    {
      id: "ops-008",
      title: "MaxPreps scrape inventory",
      owner: "Trip",
      status: "done",
      description:
        "Texas and Oklahoma programs scored into inventory. 1,840 TX coaches, 620 OK coaches. Scrape is complete — this is a list, not a send list.",
      comments: [
        { id: "oc-018", author: "Trip", body: "Scrape complete. 1,840 TX + 620 OK coaches loaded into inventory.", created_at: ago(96) },
        { id: "oc-019", author: "Hunter", body: "Numbers check out. Marked done.", created_at: ago(90) },
      ],
      updated_at: ago(90),
    },
    {
      id: "ops-009",
      title: "Explee sequence 3 logged",
      owner: "Hunter",
      status: "done",
      description:
        "1,240 sent, 38 replies — closed. Not the Texas send. This was the June sequence for existing trial accounts.",
      comments: [
        { id: "oc-020", author: "Hunter", body: "Sequence 3 closed. 38 replies, 3 converted to paid. Logged in the tracker.", created_at: ago(120) },
        { id: "oc-021", author: "Trip", body: "Good rate. Template goes to Texas next — pending approval.", created_at: ago(110) },
      ],
      updated_at: ago(110),
    },
  ]
}

export function getAllOpsCards(): OpsCard[] {
  return readCards()
}

export function getOpsCardById(id: string): OpsCard | null {
  return readCards().find((c) => c.id === id) ?? null
}

export function updateOpsCard(id: string, patch: Record<string, unknown>): OpsCard | null {
  const cards = readCards()
  const idx = cards.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const updated = { ...cards[idx], updated_at: new Date().toISOString() }
  for (const [key, val] of Object.entries(patch)) {
    if (val === null || val === undefined) {
      delete (updated as Record<string, unknown>)[key]
    } else {
      (updated as Record<string, unknown>)[key] = val
    }
  }
  cards[idx] = updated as OpsCard
  writeCards(cards)
  return cards[idx]
}

export function appendOpsComment(id: string, author: string, body: string): OpsCard | null {
  const cards = readCards()
  const idx = cards.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const comment: OpsComment = {
    id: `oc-${Date.now()}`,
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
