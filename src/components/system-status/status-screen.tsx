import Link from "next/link"
import {
  CircleCheckIcon,
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
  formatAgo,
  formatChecked,
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

/* ------------------------------------------------------------------ tone */

/**
 * Status is never colour alone: each state has its own icon and its own
 * word, and the colour sits on both. Text colours are solid and clear
 * 4.5:1 on white, on the tinted banner and on the dark card (the e2e
 * measures every node); the banner tints are translucent only in dark,
 * where the probe composites them onto the canvas.
 */
const TONE: Record<
  ServiceStatus,
  { icon: LucideIcon; text: string; banner: string; ring: string }
> = {
  operational: {
    icon: CircleCheckIcon,
    text: "text-green-700 dark:text-green-400",
    banner: "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/25",
    ring: "ring-green-600/15 dark:ring-green-400/20",
  },
  degraded: {
    icon: TriangleAlertIcon,
    text: "text-amber-700 dark:text-amber-400",
    banner: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
    ring: "ring-amber-600/15 dark:ring-amber-400/20",
  },
  down: {
    icon: CircleXIcon,
    text: "text-red-700 dark:text-red-400",
    banner: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/25",
    ring: "ring-red-600/15 dark:ring-red-400/20",
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
    <div
      role="group"
      aria-label="Preview"
      className="bg-muted inline-flex h-8 items-center rounded-lg p-[3px]"
    >
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
              "text-caption flex h-full items-center rounded-[6px] px-2.5 font-medium tracking-tight transition-colors",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
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

function VerdictBanner({ services, nowMs }: { services: readonly Service[]; nowMs: number }) {
  const verdict = verdictFor(services)
  const status: ServiceStatus = verdict.green ? "operational" : verdict.anyDown ? "down" : "degraded"
  const tone = TONE[status]
  const updated = Number.isFinite(verdict.updatedAtMs)
    ? `Updated ${formatAgo(verdict.updatedAtMs, nowMs)}`
    : "Not checked yet"

  return (
    <section
      aria-label="Current status"
      data-verdict={verdict.green ? "green" : "not-green"}
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border px-6 py-[22px]",
        tone.banner
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <span
          className={cn("grid size-7 flex-none place-items-center rounded-full ring-[6px]", tone.text, tone.ring)}
        >
          <tone.icon data-status-icon className="size-7" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-title-lg font-semibold tracking-tight">{verdict.title}</h2>
          <p className="text-label text-muted-foreground mt-1 tracking-tight">{verdict.detail}</p>
        </div>
      </div>
      <div className="text-caption text-muted-foreground flex-none text-right font-medium tracking-tight tabular-nums">
        {Number.isFinite(verdict.updatedAtMs) ? (
          <time dateTime={new Date(verdict.updatedAtMs).toISOString()}>{updated}</time>
        ) : (
          <span>{updated}</span>
        )}
        <br />
        {formatCounts(verdict.counts)}
      </div>
    </section>
  )
}

function ServiceRow({ service, nowMs }: { service: Service; nowMs: number }) {
  return (
    <li
      aria-label={service.name}
      data-service={service.id}
      className="border-border/70 hover:bg-surface-hover flex min-h-[56px] items-center justify-between gap-4 border-b px-5 py-2.5 last:border-b-0"
    >
      <div className="min-w-0">
        <div className="text-body font-semibold tracking-tight">
          {service.href ? <OutLink href={service.href}>{service.name}</OutLink> : service.name}
        </div>
        <p className="text-caption text-muted-foreground mt-[3px] tracking-tight">{service.reason}</p>
      </div>
      <div className="flex flex-none flex-col items-end gap-[3px]">
        <StatusLabel status={service.status} />
        <time
          dateTime={new Date(service.checkedAtMs).toISOString()}
          className="text-micro text-muted-foreground tracking-tight tabular-nums"
        >
          {formatChecked(service.checkedAtMs, nowMs)}
        </time>
      </div>
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">System Status</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            Health page · errors live in <OutLink href={SENTRY_HREF}>Sentry</OutLink>
          </p>
        </div>
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2.5">
          <PreviewToggle scenario={scenario} />
          <SampleDataTag className="h-6 px-2" />
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
              {formatDownCount(verdict.counts)}
            </span>
          </div>
          <Card className="gap-0 py-0">
            <ul aria-label="Services" className="flex flex-col">
              {services.map((s) => (
                <ServiceRow key={s.id} service={s} nowMs={nowMs} />
              ))}
            </ul>
          </Card>
        </section>

        <Card role="region" aria-label="Past incident" className="gap-2 px-5 py-4">
          <p className="text-micro text-muted-foreground font-semibold tracking-[0.08em] uppercase">
            Past incident
          </p>
          <div className="flex items-baseline justify-between gap-4">
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
