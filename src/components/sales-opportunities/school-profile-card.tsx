"use client"

import * as React from "react"
import { MapPinnedIcon, PencilIcon, PlusIcon, UsersIcon, XIcon } from "lucide-react"

import { formatDate } from "@/lib/clock"
import { formatCurrency } from "@/lib/metrics"
import { maxprepsLink, metroLabel, type InstitutionKind, type InstitutionRecord, type OpportunityStatus } from "@/lib/sales-map"
import { isOverdue, STAGE_CONFIG, STAGES } from "@/lib/sales-opportunities"
import { cn } from "@/lib/utils"
import { AddDealDialog, EditDealDialog } from "@/components/sales-opportunities/deal-dialogs"
import { useDeals } from "@/components/sales-opportunities/deals-store"
import { StageBadge } from "@/components/sales-opportunities/deals-screen"
import { Button, buttonVariants } from "@/components/ui/button"

const KIND_LABEL: Record<InstitutionKind, string> = {
  "high-school": "High school football",
  college: "College football",
  nfl: "NFL team",
}

const STATUS = {
  customer: { label: "Customer", color: "#16884f" },
  engaged: { label: "Engaged", color: "#d9a700" },
  available: { label: "Not a customer yet", color: "#9aa29d" },
} as const

/** 44px hit targets below desktop, like every control on Sales. */
const ACTION = "h-8 max-xl:h-11!"

/**
 * A school's profile, opened by clicking it on the territory map: where it
 * is, whether it is a customer, every deal linked to it, and the next
 * moves (add a deal already linked to it, get directions).
 */
export function SchoolProfileCard({
  school,
  status,
  onClose,
  className,
}: {
  school: InstitutionRecord
  status: OpportunityStatus
  onClose: () => void
  className?: string
}) {
  const { deals, today } = useDeals()
  const [id, name, kind, state, city, , , metro] = school
  const schoolDeals = React.useMemo(
    () =>
      deals
        .filter((deal) => deal.institutionId === id)
        // Open deals first in pipeline order, closed ones after.
        .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)),
    [deals, id]
  )
  // Search by name and town: Google finds the school itself, even for the
  // few teams the map still only places at their city's center.
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${kind === "high-school" ? "High School " : ""}${city}, ${state}`)}`
  const titleId = `school-profile-${id.replace(/[^a-z0-9]/gi, "-")}`
  const maxpreps = maxprepsLink(school)
  const linkButton = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
    ACTION
  )

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex max-h-[calc(100%-1.5rem)] w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-lg ring-1 ring-black/10",
        className
      )}
    >
      <header className="flex items-start gap-2 border-b border-slate-200 px-4 pt-3 pb-2.5">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate text-sm font-semibold">
            {name}
          </h3>
          <p className="truncate text-xs text-slate-600">
            {`${KIND_LABEL[kind]} · ${city}, ${state}${metro ? ` · ${metroLabel(metro)}` : ""}`}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium">
            <i aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: STATUS[status].color }} />
            {STATUS[status].label}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Close ${name} profile`}
          onClick={onClose}
          className="-mt-1 -mr-2 size-8 text-slate-600 hover:bg-slate-100 hover:text-slate-900 max-xl:size-11"
        >
          <XIcon aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <h4 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Deals {schoolDeals.length > 0 && `(${schoolDeals.length})`}
        </h4>
        {schoolDeals.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">No deals with {name} yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {schoolDeals.map((deal) => {
              const late = isOverdue(deal, today)
              return (
                <li key={deal.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{deal.what}</p>
                      <p className="truncate text-xs text-slate-600">
                        {`${deal.who} · ${deal.owner}${deal.value === null ? "" : ` · ${formatCurrency(deal.value)}`}`}
                      </p>
                    </div>
                    <StageBadge stage={deal.stage} className="shrink-0" />
                  </div>
                  {!STAGE_CONFIG[deal.stage].closed && (
                    <p className={cn("mt-1 text-xs", late ? "font-medium text-red-700" : "text-slate-700")}>
                      {`Next: ${deal.nextStep}${deal.nextStepDue ? ` · ${formatDate(deal.nextStepDue)}` : ""}${late ? " · Overdue" : ""}`}
                    </p>
                  )}
                  <EditDealDialog
                    deal={deal}
                    trigger={
                      <Button variant="ghost" size="sm" className={cn("-ml-2 mt-0.5 text-xs", ACTION)}>
                        <PencilIcon aria-hidden />
                        Edit deal
                      </Button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-2.5">
        <AddDealDialog
          school={{ id, name }}
          trigger={
            <Button size="sm" className={ACTION}>
              <PlusIcon aria-hidden />
              Add deal
            </Button>
          }
        />
        <a href={directions} target="_blank" rel="noopener noreferrer" className={linkButton}>
          <MapPinnedIcon aria-hidden />
          Directions
        </a>
        {maxpreps && (
          // Coaches change weekly, so the profile links to MaxPreps' own page
          // rather than keeping a copy that goes stale.
          <a
            href={maxpreps.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButton}
            title={maxpreps.direct ? "MaxPreps football page: coaches are on its Staff tab" : "Find this school on MaxPreps"}
          >
            <UsersIcon aria-hidden />
            Coaches on MaxPreps
          </a>
        )}
      </footer>
    </section>
  )
}
