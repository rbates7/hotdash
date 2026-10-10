"use client"

import Link from "next/link"
import { BugOffIcon, ChevronRightIcon } from "lucide-react"

import { STATUS_TEXT, groupBugs, hasSeedBugs, openBugs } from "@/lib/bugs"
import { formatRelative } from "@/lib/clock"
import { PRIORITY_CONFIG, STATUS_CONFIG, actorById, type Actor, type Issue } from "@/lib/issues"
import { cn } from "@/lib/utils"
import { ActorAvatar } from "@/components/agent-workplace/actor-avatar"
import { BugTag } from "@/components/bugs/bug-tag"
import { SampleDataNotice } from "@/components/sample-data"

export const SEED_BUGS_NOTICE =
  "These are example tickets from the Agent Workplace demo board. Coach names, crash reports and dates are invented."

export const EMPTY_BUGS = "No open bugs"

/** Where a bug row goes: the same ticket, opened on this page. */
export function bugHref(key: string) {
  return `/bugs?issue=${encodeURIComponent(key)}`
}

function BugRow({ issue, actors, now, onOpen }: { issue: Issue; actors: Actor[]; now: Date; onOpen?: () => void }) {
  const assignee = actorById(actors, issue.assigneeId)
  const priority = PRIORITY_CONFIG[issue.priority]
  return (
    <li className="border-border border-b last:border-b-0">
      <Link
        href={bugHref(issue.key)}
        scroll={false}
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3 px-[18px] py-3.5 text-left",
          "hover:bg-surface-hover focus-visible:ring-ring/50 transition-colors focus-visible:ring-[3px] focus-visible:outline-none max-xl:focus-visible:ring-inset",
          // Phone (Deke 12:1465): a stacked card. Tag and age on top, title,
          // then key · priority · assignee, chevron on the right.
          "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4 max-md:py-3"
        )}
      >
        <BugTag
          issue={issue}
          withSource
          className="mt-0.5 max-md:col-start-1 max-md:row-start-1 max-md:mt-0 max-md:justify-self-start"
        />
        <span className="min-w-0 flex-1 max-md:col-start-1 max-md:row-start-2">
          <span className="text-label block leading-[1.35] font-semibold tracking-tight">
            {issue.title}
          </span>
          {/* Status for the link's name: on a phone the card is read alone
              (links list, rotor), away from its group heading. Kept out of
              the title's own text so the title stays exactly the title. */}
          <span className="sr-only">, status {STATUS_CONFIG[issue.status].label}</span>
          <span className="text-caption text-muted-foreground mt-[3px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-[1.4]">
            <span className="font-mono tabular-nums">{issue.key}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <priority.icon className="size-3" aria-hidden />
              {priority.label}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              {/* The visible name says who; the avatar's own sr-only name
                  would repeat it in the link's name ("YY Yo-Yo Yo-Yo"). */}
              <span aria-hidden className="flex shrink-0">
                <ActorAvatar actor={assignee} size="sm" />
              </span>
              {assignee?.name ?? "Unassigned"}
              {assignee?.kind === "agent" && <span className="sr-only"> (agent)</span>}
            </span>
          </span>
        </span>
        {/* Age since the report, from the page's one clock — default
            `ago` style, same as the Workplace ticket view. */}
        <span
          data-testid="bug-age"
          className="text-micro text-muted-foreground shrink-0 pt-0.5 font-medium whitespace-nowrap max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:pt-0"
        >
          {formatRelative(Date.parse(issue.createdAt), now.getTime())}
        </span>
        <ChevronRightIcon
          data-testid="bug-chevron"
          aria-hidden
          className="text-muted-foreground size-4 self-center justify-self-end md:hidden max-md:col-start-2 max-md:row-start-2"
        />
      </Link>
    </li>
  )
}

export function BugsList({
  issues,
  actors,
  now,
  onOpen,
}: {
  issues: Issue[]
  actors: Actor[]
  now: Date
  onOpen?: () => void
}) {
  const groups = groupBugs(issues)
  const open = openBugs(issues).length
  const fixed = groups.find((g) => g.status === "done")?.bugs.length ?? 0
  const seedNotice = hasSeedBugs(issues)

  return (
    <section aria-label="Bug list" className="flex min-w-0 flex-col gap-3">
      {seedNotice && <SampleDataNotice>{SEED_BUGS_NOTICE}</SampleDataNotice>}
      <p className="text-caption text-muted-foreground -mt-1 tracking-tight">
        Agent Workplace tickets tagged <span className="font-mono">bug</span>, grouped by
        status. {open} open · {fixed} fixed.
      </p>

      {open === 0 && (
        <p
          role="status"
          aria-label="Empty bug list"
          className="bg-surface border-surface-border text-label text-muted-foreground flex items-center justify-center gap-2 rounded-xl border px-[18px] py-8"
        >
          <BugOffIcon className="size-4" aria-hidden />
          {EMPTY_BUGS}
        </p>
      )}

      {groups.map(({ status, bugs }) => {
        const config = STATUS_CONFIG[status]
        return (
          <section key={status} aria-label={config.label} className="flex min-w-0 flex-col gap-1.5">
            <header className="flex min-h-6 items-center gap-2 px-0.5">
              <config.icon className={cn("size-3.5", config.iconColor)} aria-hidden />
              <h2 className={cn("text-caption font-semibold tracking-tight", STATUS_TEXT[status])}>
                {config.label}
              </h2>
              <span className="text-micro text-muted-foreground bg-muted grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums">
                {bugs.length}
              </span>
            </header>
            <ul className="bg-surface border-surface-border overflow-hidden rounded-xl border">
              {bugs.map((issue) => (
                <BugRow key={issue.key} issue={issue} actors={actors} now={now} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )
      })}
    </section>
  )
}
