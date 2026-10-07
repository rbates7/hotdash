import Link from "next/link"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ExternalLinkIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { formatDate } from "@/lib/clock"
import {
  DEFAULT_SCENARIO,
  PREVIEW_PARAM,
  SENTRY_HREF,
  STATUS_LABEL,
  buildPastIncident,
  buildServices,
  formatChecked,
  formatCheckedAgo,
  formatCounts,
  formatDownCount,
  verdictFor,
  type Scenario,
  type Service,
  type ServiceStatus,
} from "@/lib/system-status"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"
import {
  STATUS_BANNER,
  STATUS_BANNER_META,
  STATUS_HEADER,
  STATUS_HEADER_CHIP,
  STATUS_HEADER_META,
  STATUS_INCIDENT,
  STATUS_PREVIEW,
  STATUS_PREVIEW_OPTION,
  STATUS_ROW,
} from "@/components/system-status/responsive"

/* ------------------------------------------------------------------ tone */

/**
 * Status is never colour alone: each state has its own icon and its own
 * word, and the colour sits on both. The words use the theme's text-safe
 * status tokens (`--success-text` / `--warning-text` / `--danger-text`),
 * which clear 4.5:1 on a surface in both themes — the e2e measures every
 * node. Banner tints are fills, built from the matching fill tokens.
 */
const TONE: Record<
  ServiceStatus,
  { icon: LucideIcon; text: string; banner: string; ring: string }
> = {
  operational: {
    icon: CircleCheckIcon,
    text: "text-success-text",
    banner: "bg-success/8 border-success/25 dark:bg-success/12",
    ring: "ring-success/15",
  },
  degraded: {
    icon: TriangleAlertIcon,
    text: "text-warning-text",
    banner: "bg-warning/12 border-warning/35 dark:bg-warning/12 dark:border-warning/25",
    ring: "ring-warning/25",
  },
  down: {
    icon: CircleXIcon,
    text: "text-danger-text",
    banner: "bg-destructive/8 border-destructive/25 dark:bg-destructive/12",
    ring: "ring-destructive/15",
  },
}

/** Icon + word, coloured together. */
function StatusLabel({ status, className }: { status: ServiceStatus; className?: string }) {
  const tone = TONE[status]
  return (
    <span
      data-testid="status-label"
      data-status={status}
      className={cn("text-label inline-flex items-center gap-1.5 font-semibold tracking-tight", tone.text, className)}
    >
      <tone.icon data-status-icon className="size-[15px]" strokeWidth={2.25} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** A plain external link, marked as such. */
function OutLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-foreground inline-flex items-center gap-1 font-medium underline decoration-faint-foreground underline-offset-[3px] hover:decoration-foreground",
        className
      )}
    >
      {children}
      <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  )
}

/* ---------------------------------------------------------------- preview */

/**
 * The dev switch between the two seeded views. A pair of links, not a
 * stored setting: the page re-renders on the server with the chosen
 * scenario, the URL says which one is showing, and the next visit is
 * green again — a health page should not remember a "not green" that was
 * only ever a preview.
 */
function PreviewToggle({ scenario }: { scenario: Scenario }) {
  const options: { value: Scenario; label: string; href: string }[] = [
    { value: "green", label: "Green", href: "/system-status" },
    { value: "not-green", label: "Not green", href: `/system-status?${PREVIEW_PARAM}=not-green` },
  ]
  return (
    <div role="group" aria-label="Preview" className={STATUS_PREVIEW}>
      <span className="text-micro text-muted-foreground px-2 font-semibold tracking-[0.06em] uppercase select-none">
        Preview
      </span>
      {options.map((o) => {
        const active = o.value === scenario
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              STATUS_PREVIEW_OPTION,
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- pieces */

/** Neutral — not green, not degraded. Used when there are no checks at all. */
const EMPTY_TONE = {
  icon: CircleDashedIcon,
  text: "text-muted-foreground",
  banner: "bg-muted/40 border-border",
  ring: "ring-border/50",
} as const

function VerdictBanner({ services, nowMs }: { services: readonly Service[]; nowMs: number }) {
  const verdict = verdictFor(services)
  const status: ServiceStatus = verdict.green ? "operational" : verdict.anyDown ? "down" : "degraded"
  const tone = verdict.empty ? EMPTY_TONE : TONE[status]
  const updated = Number.isFinite(verdict.updatedAtMs)
    ? `Updated ${formatCheckedAgo(verdict.updatedAtMs, nowMs)}`
    : "Not checked yet"

  return (
    <section
      aria-label="Current status"
      data-verdict={verdict.empty ? "empty" : verdict.green ? "green" : "not-green"}
      className={cn(STATUS_BANNER, tone.banner)}
    >
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <span
          className={cn("grid size-7 flex-none place-items-center rounded-full ring-[6px]", tone.text, tone.ring)}
        >
          <tone.icon data-status-icon className="size-7" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title-lg font-semibold tracking-tight">{verdict.title}</h2>
            <SampleDataTag />
          </div>
          <p className="text-label text-muted-foreground mt-1 tracking-tight">{verdict.detail}</p>
        </div>
      </div>
      <div className={STATUS_BANNER_META}>
        {Number.isFinite(verdict.updatedAtMs) ? (
          <time dateTime={new Date(verdict.updatedAtMs).toISOString()}>{updated}</time>
        ) : (
          <span>{updated}</span>
        )}
        {!verdict.empty && (
          <>
            <br />
            {formatCounts(verdict.counts)}
          </>
        )}
      </div>
    </section>
  )
}

function ServiceRow({ service, nowMs }: { service: Service; nowMs: number }) {
  return (
    <li
      aria-label={service.name}
      data-service={service.id}
      className={STATUS_ROW}
    >
      <div className="text-body min-w-0 font-semibold tracking-tight [grid-area:name]">
        {service.href ? <OutLink href={service.href}>{service.name}</OutLink> : service.name}
      </div>
      <StatusLabel status={service.status} className="self-center justify-self-end [grid-area:status]" />
      <p className="text-caption text-muted-foreground [grid-area:reason] tracking-tight">{service.reason}</p>
      <time
        dateTime={new Date(service.checkedAtMs).toISOString()}
        className="text-micro text-muted-foreground [grid-area:time] tracking-tight tabular-nums md:justify-self-end"
      >
        {formatChecked(service.checkedAtMs, nowMs)}
      </time>
    </li>
  )
}

/* ----------------------------------------------------------------- screen */

/**
 * The whole System Status page below the shell. Pure: everything it shows
 * is derived from `nowMs` and the chosen scenario, so the server render is
 * the final render — no store, no hydration, nothing saved.
 */
export function StatusScreen({
  nowMs,
  scenario = DEFAULT_SCENARIO,
}: {
  /** The request's instant, read once in page.tsx. Every "ago" is measured from it. */
  nowMs: number
  scenario?: Scenario
}) {
  const services = buildServices(nowMs, scenario)
  const verdict = verdictFor(services)
  const incident = buildPastIncident(nowMs)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className={STATUS_HEADER}>
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">System Status</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            Health page · errors live in <OutLink href={SENTRY_HREF}>Sentry</OutLink>
          </p>
        </div>
        <div className={STATUS_HEADER_META}>
          <PreviewToggle scenario={scenario} />
          <SampleDataTag className={STATUS_HEADER_CHIP} />
        </div>
      </header>

      <SampleDataNotice>
        Nothing here is polled yet. Sentry and chlkapp.com are not connected, so these
        checks are seeded from the moment you opened the page.
      </SampleDataNotice>

      <div className="flex max-w-[920px] flex-col gap-4">
        <VerdictBanner services={services} nowMs={nowMs} />

        <section aria-label="Components" className="flex flex-col gap-2">
          <div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-label font-semibold tracking-tight">Components</h2>
              <SampleDataTag />
            </div>
            <span className="text-caption text-muted-foreground font-medium tracking-tight">
              {verdict.empty ? "No checks" : formatDownCount(verdict.counts)}
            </span>
          </div>
          <Card className="gap-0 py-0">
            {services.length === 0 ? (
              <p className="text-label text-muted-foreground px-5 py-6 tracking-tight">
                Nothing is connected. There are no checks to report.
              </p>
            ) : (
              <ul aria-label="Services" className="flex flex-col">
                {services.map((s) => (
                  <ServiceRow key={s.id} service={s} nowMs={nowMs} />
                ))}
              </ul>
            )}
          </Card>
        </section>

        <Card role="region" aria-label="Past incident" className="gap-2 px-5 py-4">
          <div className="flex items-center gap-2">
            <p className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
              Past incident
            </p>
            <SampleDataTag />
          </div>
          <div className={STATUS_INCIDENT}>
            <p className="text-label text-muted-foreground font-medium tracking-tight">{incident.summary}</p>
            <time
              dateTime={incident.day}
              className="text-caption text-muted-foreground flex-none font-medium tracking-tight tabular-nums whitespace-nowrap"
            >
              {formatDate(incident.day)}
            </time>
          </div>
        </Card>
      </div>
    </div>
  )
}
