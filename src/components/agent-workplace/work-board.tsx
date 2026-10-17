"use client"

import * as React from "react"
import { ExternalLinkIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  NOT_CONNECTED,
  WORK_COLUMNS,
  groupByState,
  ownerName,
  parseWorkboard,
  type CiStatus,
  type ReviewStatus,
  type WorkItem,
  type Workboard,
} from "@/lib/workboard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Load = { kind: "loading" } | { kind: "ready"; board: Workboard }

/** Reads Hill's /api/workboard. A missing route (404) or error is Not connected. */
export function useWorkboard(): Load {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" })
  React.useEffect(() => {
    let alive = true
    fetch("/api/workboard", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => alive && setLoad({ kind: "ready", board: parseWorkboard(json) }))
      .catch(() => alive && setLoad({ kind: "ready", board: NOT_CONNECTED }))
    return () => {
      alive = false
    }
  }, [])
  return load
}

const CI_LABEL: Record<CiStatus, string> = { passing: "CI passing", failing: "CI failing", pending: "CI pending", none: "No CI" }
const CI_TONE: Record<CiStatus, string> = {
  passing: "bg-success/10 text-success-text border-transparent",
  failing: "text-danger-text",
  pending: "text-warning-text",
  none: "text-muted-foreground!",
}
const REVIEW_LABEL: Record<ReviewStatus, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Review pending",
  none: "No review",
}
const REVIEW_TONE: Record<ReviewStatus, string> = {
  approved: "bg-success/10 text-success-text border-transparent",
  changes_requested: "text-danger-text",
  pending: "text-warning-text",
  none: "text-muted-foreground!",
}

/** 44px touch targets below 1280; compact on desktop. */
const LINK = "inline-flex min-h-11 xl:min-h-0 items-center gap-1 text-caption font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-2"

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })
}

function WorkCard({ item }: { item: WorkItem }) {
  return (
    <li>
      <Card size="sm" className="gap-2" data-testid="work-card">
        <CardHeader>
          <CardTitle className="text-body font-medium">{item.title}</CardTitle>
          <p className="text-caption text-muted-foreground">
            {ownerName(item.owner)} · <code className="break-all">{item.branch}</code>
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={CI_TONE[item.ci]}>{CI_LABEL[item.ci]}</Badge>
            <Badge variant="outline" className={REVIEW_TONE[item.review]}>{REVIEW_LABEL[item.review]}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-3">
            <a className={LINK} href={item.url} target="_blank" rel="noreferrer">
              PR #{item.number}
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
            {item.proofLinks.map((href, i) => (
              <a key={href} className={LINK} href={href} target="_blank" rel="noreferrer">
                Proof{item.proofLinks.length > 1 ? ` ${i + 1}` : ""}
                <ExternalLinkIcon aria-hidden className="size-3" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </li>
  )
}

export function WorkBoardView({ load }: { load: Load }) {
  if (load.kind === "loading") {
    return <p aria-busy className="text-body text-muted-foreground py-6">Checking the work board…</p>
  }
  const { board } = load
  if (!board.connected) {
    return (
      <div data-testid="workboard-not-connected" className="rounded-lg border border-dashed p-6 text-center">
        <Badge variant="outline" className="text-muted-foreground!">Not connected</Badge>
        <p className="mt-2 text-body text-muted-foreground">
          The work board reads branches, PRs, CI and reviews from GitHub. It isn&apos;t connected yet.
        </p>
      </div>
    )
  }
  const groups = groupByState(board.items)
  return (
    <div className="flex flex-col gap-2">
      {board.stale && (
        <p data-testid="workboard-stale" className="text-caption text-muted-foreground">
          GitHub could not be read just now; showing the last good copy from {formatTime(board.fetchedAt)}.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {WORK_COLUMNS.map((col) => (
          <section key={col.state} aria-label={col.label} className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/40 p-2">
            <h2 className="flex items-center justify-between text-body font-semibold">
              {col.label}
              <span className="text-caption text-muted-foreground">{groups[col.state].length}</span>
            </h2>
            <ul className={cn("flex flex-col gap-2")}>
              {groups[col.state].map((item) => (
                <WorkCard key={item.number} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export function WorkBoard() {
  return <WorkBoardView load={useWorkboard()} />
}
