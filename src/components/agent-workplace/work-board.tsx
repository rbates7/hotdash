"use client"

import { ExternalLinkIcon, GitPullRequestIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { WorkboardCi, WorkboardItem, WorkboardReview } from "@/lib/workboard"
import {
  WORK_COLUMNS,
  formatWorkboardTime,
  groupByState,
  ownerName,
  staleNoteText,
  workboardAnnouncement,
  workboardKind,
  type WorkboardView,
} from "@/lib/workboard-view"
import { useWorkboardView } from "@/hooks/use-workboard"
import { ConnectingBadge } from "@/components/connecting-badge"
import { NotConnectedPanel } from "@/components/not-connected-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * The work board: rbates7/hotdash's pull requests from `GET /api/workboard`
 * (#51), in four columns. Rashad's Oct 16 rule (plan L99-101): no sample
 * rows, ever. Before the first answer, or while the server's first GitHub
 * sync runs, it says Connecting…; with no token it says Not connected; a
 * connected board with nothing on it says "No open pull requests"; a failed
 * sync keeps the last good rows under a stale note.
 */

export const WORKBOARD_SOURCE = "Reads rbates7/hotdash's pull requests, CI and reviews from GitHub."

const CI_LABEL: Record<WorkboardCi, string> = {
  passing: "CI passing",
  failing: "CI failing",
  pending: "CI pending",
  none: "No CI",
}
const REVIEW_LABEL: Record<WorkboardReview, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Review pending",
  none: "No review",
}
/**
 * Badge tones. The outline variant's text colour is a layered rule
 * (`cn-badge-variant-outline`), so a plain `text-*` utility loses to it and
 * every badge came out neutral; like `NotConnectedBadge`, the tone is
 * `!important` and the word sits in a child span that inherits it. The
 * text-safe status tokens (as on System Status) clear 4.5:1 on the card in
 * both themes; status is never colour alone, the word says it.
 */
export const WORKBOARD_TONE = {
  good: "bg-success/10 text-success-text! border-transparent",
  bad: "text-danger-text! border-destructive/40",
  wait: "text-warning-text! border-warning/50",
  none: "text-muted-foreground!",
} as const
const TONE = WORKBOARD_TONE
const CI_TONE: Record<WorkboardCi, string> = { passing: TONE.good, failing: TONE.bad, pending: TONE.wait, none: TONE.none }
const REVIEW_TONE: Record<WorkboardReview, string> = {
  approved: TONE.good,
  changes_requested: TONE.bad,
  pending: TONE.wait,
  none: TONE.none,
}

/** 44px touch targets below 1280; compact on desktop. */
const LINK =
  "inline-flex min-h-11 min-w-11 items-center gap-1 rounded-sm text-caption font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring xl:min-h-0 xl:min-w-0"

/** The frame every non-row state shares, so the tab does not jump between them. */
const STATE_FRAME =
  "bg-surface border-surface-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center"

function WorkCard({ item }: { item: WorkboardItem }) {
  return (
    <li>
      <Card size="sm" className="gap-2" data-testid="work-card">
        <CardHeader>
          <CardTitle className="text-body font-medium break-words">{item.title}</CardTitle>
          <p className="text-caption text-muted-foreground">
            {ownerName(item.owner)}
            {formatWorkboardTime(item.mergedAt) ? (
              <> · Merged <time dateTime={item.mergedAt!}>{formatWorkboardTime(item.mergedAt)}</time></>
            ) : formatWorkboardTime(item.updatedAt) ? (
              <> · Updated <time dateTime={item.updatedAt}>{formatWorkboardTime(item.updatedAt)}</time></>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" data-testid="work-ci" data-tone={item.ci} className={CI_TONE[item.ci]}>
              <span>{CI_LABEL[item.ci]}</span>
            </Badge>
            <Badge variant="outline" data-testid="work-review" data-tone={item.review} className={REVIEW_TONE[item.review]}>
              <span>{REVIEW_LABEL[item.review]}</span>
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-3">
            <a className={LINK} href={item.url} target="_blank" rel="noopener noreferrer">
              PR #{item.number}
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}

function StaleNote({ fetchedAt }: { fetchedAt: string }) {
  return (
    <p data-testid="workboard-stale" className="text-caption text-warning-text tracking-tight">
      {staleNoteText(fetchedAt)}
    </p>
  )
}

function WorkBoardBody({ view }: { view: WorkboardView }) {
  const kind = workboardKind(view)

  if (kind === "connecting") {
    return (
      <section
        aria-label="Work board: connecting"
        aria-busy="true"
        data-testid="workboard-connecting"
        data-source="connecting"
        className={STATE_FRAME}
      >
        <ConnectingBadge testId="workboard-connecting-badge" />
        <p className="text-label font-semibold tracking-tight">Work board</p>
        <p className="text-caption text-muted-foreground max-w-prose tracking-tight">
          Reading pull requests from GitHub. Cards appear when the first read finishes.
        </p>
      </section>
    )
  }

  if (kind === "not_connected" || view.phase !== "ready") {
    return (
      <NotConnectedPanel
        title="Work board"
        hint={`${WORKBOARD_SOURCE} It isn't connected yet, so there are no cards.`}
        testId="workboard-not-connected"
      />
    )
  }

  const { summary } = view
  const updated = summary.fetchedAt ? formatWorkboardTime(summary.fetchedAt) : ""

  if (kind === "empty") {
    return (
      <div className="flex flex-col gap-2">
        {summary.stale && <StaleNote fetchedAt={summary.fetchedAt} />}
        <section
          aria-label="Work board: no open pull requests"
          data-testid="workboard-empty"
          data-source={summary.status}
          className={STATE_FRAME}
        >
          <GitPullRequestIcon aria-hidden className="text-muted-foreground size-5" />
          <p className="text-label font-semibold tracking-tight">No open pull requests</p>
          <p className="text-caption text-muted-foreground max-w-prose tracking-tight">
            Nothing open on rbates7/hotdash and nothing merged in the last 14 days.
            {updated ? ` Checked ${updated}.` : ""}
          </p>
        </section>
      </div>
    )
  }

  const groups = groupByState(summary.items)
  return (
    <div className="flex flex-col gap-2" data-testid="workboard-live" data-source={summary.status}>
      {summary.stale ? (
        <StaleNote fetchedAt={summary.fetchedAt} />
      ) : (
        <p className="text-caption text-muted-foreground tracking-tight">
          From GitHub{updated ? ` · updated ${updated}` : ""}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {WORK_COLUMNS.map((col) => (
          <section
            key={col.state}
            aria-label={col.label}
            className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/40 p-2"
          >
            <h2 className="flex items-center justify-between text-body font-semibold">
              {col.label}
              <span className="text-caption text-muted-foreground tabular-nums">{groups[col.state].length}</span>
            </h2>
            {groups[col.state].length === 0 ? (
              <p className="text-caption text-muted-foreground px-1 pb-1">None</p>
            ) : (
              <ul className={cn("flex flex-col gap-2")}>
                {groups[col.state].map((item) => (
                  <WorkCard key={item.number} item={item} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

export const WORKBOARD_ANNOUNCE_PREFIX = "Work board: "

/**
 * The board plus one polite live region that is always mounted (so a change
 * of state is announced, not just a fresh mount): Connecting…, Not
 * connected, No open pull requests, "N PRs updated <time CT>", or the stale
 * note, each led by "Work board:" so a screen reader says which region
 * spoke. Visually hidden; the visible states say the same thing.
 */
export function WorkBoardView({ view }: { view: WorkboardView }) {
  return (
    <div className="flex min-w-0 flex-col">
      <p role="status" aria-live="polite" aria-atomic="true" data-testid="workboard-announce" className="sr-only">
        {WORKBOARD_ANNOUNCE_PREFIX}
        {workboardAnnouncement(view)}
      </p>
      <WorkBoardBody view={view} />
    </div>
  )
}

export function WorkBoard() {
  return <WorkBoardView view={useWorkboardView()} />
}
