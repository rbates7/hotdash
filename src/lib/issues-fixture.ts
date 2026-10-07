import { DEMO_NOW } from "@/lib/clock"
import type { Actor, Issue, Sprint } from "@/lib/issues"

/**
 * Dummy data for the Agent Workplace design mock. Timestamps are generated
 * relative to the shared demo clock (`@/lib/clock`) rather than `Date.now()`
 * so server and client render identically — a moving "now" would hydrate
 * mismatched — and so every page measures from the same instant.
 *
 * The active-sprint issues mirror founder-dashboard-workplace-v0.html card
 * for card; everything else is filler so the Backlog tab has something to
 * plan with.
 */
export const NOW = DEMO_NOW

const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString()
const daysFromNow = (d: number) =>
  new Date(NOW.getTime() + d * 86_400_000).toISOString()

export const RASHAD = "rashad"
export const MAY = "may"

/**
 * Roster. Humans are the two people who touch this board; agents use the
 * placeholder names from the requirements doc — do not swap in real ones.
 */
export const actors: Actor[] = [
  { id: RASHAD, name: "Rashad", kind: "human", initials: "RB", tone: "brand" },
  { id: MAY, name: "May", kind: "human", initials: "MW", tone: "neutral" },
  { id: "grok-1", name: "Grok-1", kind: "agent", initials: "G1" },
  { id: "grok-2", name: "Grok-2", kind: "agent", initials: "G2" },
  { id: "grok-3", name: "Grok-3", kind: "agent", initials: "G3" },
]

export const sprints: Sprint[] = [
  {
    id: "sprint-4",
    name: "Sprint 4",
    goal: "Playbook editor polish and the sharing path",
    startDate: hoursAgo(24 * 5),
    endDate: daysFromNow(9),
    status: "active",
  },
  {
    id: "sprint-5",
    name: "Sprint 5",
    goal: "Billing edge cases and imports",
    startDate: daysFromNow(10),
    endDate: daysFromNow(24),
    status: "planned",
  },
]

type Seed = Omit<
  Issue,
  "activity" | "comments" | "priority" | "labels" | "createdById" | "createdAt"
> & {
  priority?: Issue["priority"]
  labels?: Issue["labels"]
  createdById?: Issue["createdById"]
  createdAt?: Issue["createdAt"]
  activity?: Issue["activity"]
  comments?: Issue["comments"]
}

function issue(seed: Seed): Issue {
  const createdById = seed.createdById ?? RASHAD
  const createdAt = seed.createdAt ?? hoursAgo(72)
  return {
    priority: "none",
    labels: [],
    activity: [
      {
        id: `${seed.key}-a1`,
        actorId: createdById,
        verb: "created this issue",
        at: createdAt,
      },
    ],
    comments: [],
    ...seed,
    createdById,
    createdAt,
  }
}

export const issues: Issue[] = [
  // ---- active sprint (matches the mock) ----------------------------------
  issue({
    key: "CHLK-401",
    title: "Snap-to-hash on new formations",
    description:
      "When a coach drops a new formation, players should snap to the nearest hash mark instead of landing wherever the finger lifted.",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    sprintId: "sprint-4",
    labels: ["editor"],
    updatedAt: hoursAgo(20),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-402",
    title: "Copy-link expires after 7 days",
    description: "Shared links should stop resolving a week after they were made.",
    status: "todo",
    priority: "medium",
    assigneeId: MAY,
    sprintId: "sprint-4",
    labels: ["sharing"],
    updatedAt: hoursAgo(18),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-403",
    title: "Annual-plan renewal reminder copy",
    description: "Email goes out 14 days before the annual charge. Needs words.",
    status: "todo",
    priority: "low",
    assigneeId: RASHAD,
    sprintId: "sprint-4",
    labels: ["billing"],
    updatedAt: hoursAgo(16),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-404",
    title: "Undo stack for iPad canvas",
    description:
      "Coaches keep losing the last few canvas moves on iPad. Keep a 20-step undo on the canvas and persist it with the book.",
    status: "in_progress",
    priority: "urgent",
    assigneeId: "grok-1",
    sprintId: "sprint-4",
    labels: ["editor", "ipad"],
    createdAt: hoursAgo(17),
    updatedAt: hoursAgo(0.4),
    isAgentWorking: true,
  }),
  issue({
    key: "CHLK-405",
    title: "Staff-seat invite from the sheet",
    description:
      "Staff-seat invites should land in the same share sheet, not a new email thread. Invitee gets a seat; the sheet stays one thread.",
    status: "in_progress",
    priority: "high",
    assigneeId: "grok-2",
    sprintId: "sprint-4",
    labels: ["sharing"],
    createdAt: hoursAgo(16.5),
    updatedAt: hoursAgo(0.8),
    isAgentWorking: true,
  }),
  issue({
    key: "CHLK-406",
    title: "Failed-card webhook from Stripe",
    description:
      "Handle invoice.payment_failed so a declined card downgrades gracefully instead of silently.",
    status: "in_progress",
    priority: "urgent",
    assigneeId: RASHAD,
    sprintId: "sprint-4",
    labels: ["billing"],
    updatedAt: hoursAgo(4),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-407",
    title: "Empty-state for a new book",
    description: "First-run screen when a playbook has no plays yet.",
    status: "in_review",
    priority: "medium",
    assigneeId: MAY,
    sprintId: "sprint-4",
    labels: ["editor"],
    updatedAt: hoursAgo(6),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-408",
    title: "Preview thumbnail on iPad",
    description: "Render a play thumbnail for the book grid on iPad.",
    status: "in_review",
    priority: "high",
    assigneeId: "grok-3",
    sprintId: "sprint-4",
    labels: ["ipad"],
    updatedAt: hoursAgo(0.3),
    isAgentWorking: true,
  }),
  issue({
    key: "CHLK-409",
    title: "Receipt email subject line",
    status: "done",
    priority: "low",
    assigneeId: RASHAD,
    sprintId: "sprint-4",
    labels: ["billing"],
    updatedAt: hoursAgo(30),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-410",
    title: "Rename-book modal",
    status: "done",
    priority: "medium",
    assigneeId: MAY,
    sprintId: "sprint-4",
    labels: ["editor"],
    updatedAt: hoursAgo(28),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-411",
    title: "Revoke a shared link",
    status: "done",
    priority: "medium",
    assigneeId: RASHAD,
    sprintId: "sprint-4",
    labels: ["sharing"],
    updatedAt: hoursAgo(26),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-412",
    title: "Refund path for annual seats",
    description: "Partial refund when a staff seat is removed mid-year.",
    status: "blocked",
    priority: "high",
    assigneeId: MAY,
    sprintId: "sprint-4",
    labels: ["billing"],
    updatedAt: hoursAgo(2),
    isAgentWorking: false,
    blockerReason: "Waiting on Stripe dashboard access.",
  }),
  issue({
    key: "CHLK-413",
    title: "Import a Visio playbook",
    status: "blocked",
    priority: "low",
    assigneeId: null,
    sprintId: "sprint-4",
    labels: ["import"],
    updatedAt: hoursAgo(40),
    isAgentWorking: false,
    blockerReason: "Need a sample .vsdx from a coach.",
  }),

  // ---- backlog -----------------------------------------------------------
  issue({
    key: "CHLK-414",
    title: "Persist board state to a real datastore",
    description: "Everything is in memory today; a reload resets it.",
    status: "todo",
    priority: "high",
    assigneeId: null,
    sprintId: null,
    labels: ["infra"],
    createdById: "grok-3",
    updatedAt: hoursAgo(58),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-415",
    title: "Autopilots: daily standup summary",
    description: "Cron job posting yesterday's movement each morning.",
    status: "todo",
    priority: "low",
    assigneeId: null,
    sprintId: null,
    labels: ["backend"],
    createdById: "grok-2",
    updatedAt: hoursAgo(64),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-416",
    title: "Inbox: ping only when a decision is needed",
    description: "Not a notification per status change.",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    sprintId: null,
    labels: ["backend"],
    updatedAt: hoursAgo(62),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-417",
    title: "Proration preview before adding a staff seat",
    status: "todo",
    priority: "medium",
    assigneeId: MAY,
    sprintId: null,
    labels: ["billing"],
    updatedAt: hoursAgo(54),
    isAgentWorking: false,
  }),
  issue({
    key: "CHLK-418",
    title: "Import from Hudl play cards",
    status: "todo",
    priority: "low",
    assigneeId: null,
    sprintId: null,
    labels: ["import"],
    createdById: "grok-1",
    updatedAt: hoursAgo(52),
    isAgentWorking: false,
  }),
]
