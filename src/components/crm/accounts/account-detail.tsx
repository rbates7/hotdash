"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, SearchIcon } from "lucide-react"

import { formatMrr, searchUsers, type AccountOrg } from "@/lib/crm/accounts/model"
import { now } from "@/lib/clock"
import { cn } from "@/lib/utils"
import { useCrmAccount } from "@/hooks/use-crm-accounts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { NotConnectedPanel } from "@/components/not-connected-panel"
import { NotConnectedBadge } from "@/components/home/not-connected"
import { CrmSessionExpired } from "@/components/crm/crm-data"
import { CRM_44, CRM_LINK_44 } from "@/components/crm/crm-touch"
import { FreshnessNote, OrgAvatar, OrgPlanChip, QuietTag, UserCards, UsersTable } from "@/components/crm/accounts/account-parts"
import { ACCOUNTS_HINT } from "@/components/crm/accounts/accounts-screen"

/**
 * One organization (`/crm/accounts/<id>`): breadcrumb, header, three tiles
 * and its users with a search. Read-only.
 */
export function AccountDetail({ orgId }: { orgId: string }) {
  const view = useCrmAccount(orgId)
  const [nowMs] = React.useState(() => now().getTime())

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 md:px-6" data-testid="account-detail">
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex min-w-0 items-center gap-1.5">
          <li>
            <Link href="/crm/accounts" className={cn("text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5", CRM_LINK_44)}>
              <ArrowLeftIcon aria-hidden className="size-4" />
              Accounts
            </Link>
          </li>
          {view.phase === "ready" && view.data.org ? (
            <li aria-current="page" className="min-w-0 truncate font-medium">
              <span aria-hidden className="text-muted-foreground mr-1.5">
                /
              </span>
              {view.data.org.name}
            </li>
          ) : null}
        </ol>
      </nav>

      {view.phase === "unauthorized" ? (
        <CrmSessionExpired />
      ) : view.phase === "not_found" ? (
        <section data-testid="account-not-found" className="bg-surface border-surface-border rounded-xl border px-4 py-12 text-center">
          <p className="text-label font-semibold">No organization with this id</p>
          <p className="text-caption text-muted-foreground mt-1">It may have been renamed or merged. Go back to Accounts to find it.</p>
        </section>
      ) : view.phase === "loading" || view.data.status === "connecting" ? (
        <div aria-busy="true" data-testid="account-skeleton" className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : view.data.status === "not_connected" || !view.data.org ? (
        <>
          <NotConnectedPanel title="Organization" hint={ACCOUNTS_HINT} testId="accounts-not-connected" />
          <FreshnessNote {...view.data} nowMs={nowMs} />
        </>
      ) : (
        <>
          <FreshnessNote {...view.data} nowMs={nowMs} />
          <OrgHeader org={view.data.org} />
          <OrgUsers org={view.data.org} />
        </>
      )}
    </div>
  )
}

function OrgHeader({ org }: { org: AccountOrg }) {
  return (
    <section aria-label={org.name} className="bg-surface border-surface-border flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <OrgAvatar name={org.name} className="size-11" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{org.name}</h1>
          <p className="text-muted-foreground truncate font-mono text-[0.8rem]">
            {[org.domain, org.stripeCustomerId ? `Stripe customer ${org.stripeCustomerId}` : null].filter(Boolean).join(" · ") || "No Stripe customer"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <OrgPlanChip org={org} />
            {org.canceled ? <QuietTag>Canceled</QuietTag> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <DetailTile label="Users" value={org.users.length} />
        <DetailTile label="MRR" value={org.canceled ? "—" : formatMrr(org.mrrCents)} />
        <DetailTile label="Open cases" value={org.openCases === null ? null : org.openCases} />
      </div>
    </section>
  )
}

/** A detail tile; `null` is a source that could not be read: Not connected, never 0. */
function DetailTile({ label, value }: { label: string; value: React.ReactNode | null }) {
  return (
    <div className="bg-background flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5">
      <span className="text-caption text-muted-foreground truncate">{label}</span>
      {value === null ? (
        <NotConnectedBadge className="self-start" />
      ) : (
        <span className="font-mono text-base font-semibold tabular-nums">{value}</span>
      )}
    </div>
  )
}

function OrgUsers({ org }: { org: AccountOrg }) {
  const [q, setQ] = React.useState("")
  const users = searchUsers(org.users, q)
  return (
    <section aria-label="Users" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-label font-semibold">
          Users <span className="text-muted-foreground font-normal tabular-nums">{org.users.length}</span>
        </h2>
        <div className="relative w-full md:w-64">
          <SearchIcon aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            aria-label="Search users"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users…"
            className={cn("h-9 pl-8!", CRM_44)}
          />
        </div>
      </div>
      {org.users.length === 0 ? (
        <p className="text-caption text-muted-foreground rounded-xl border px-4 py-8 text-center">No users attached to {org.name} yet.</p>
      ) : users.length === 0 ? (
        <div data-testid="users-no-results" className="flex flex-col items-center gap-2 rounded-xl border px-4 py-8 text-center">
          <p className="text-label font-semibold">No users match “{q.trim()}”</p>
          <Button variant="outline" className={CRM_44} onClick={() => setQ("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <UsersTable users={users} label={`Users of ${org.name}`} className="max-xl:hidden" />
          <div className="rounded-xl border px-3 xl:hidden">
            <UserCards users={users} label={`Users of ${org.name}`} />
          </div>
          <p className="text-caption text-muted-foreground">Plan shows struck through when that user canceled.</p>
        </>
      )}
    </section>
  )
}
