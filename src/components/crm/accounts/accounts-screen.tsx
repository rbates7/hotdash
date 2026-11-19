"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowRightIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  UserRoundXIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import {
  ACCOUNT_TABS,
  accountsTotals,
  formatMrr,
  isAccountTab,
  visibleAccounts,
  tabCount,
  type AccountOrg,
  type AccountTab,
  type AccountUser,
  type AccountsResponse,
} from "@/lib/crm/accounts/model"
import { now } from "@/lib/clock"
import { cn } from "@/lib/utils"
import { useCrmAccounts } from "@/hooks/use-crm-accounts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { NotConnectedPanel } from "@/components/not-connected-panel"
import { CrmSessionExpired } from "@/components/crm/crm-data"
import { CRM_44, CRM_LINK_44 } from "@/components/crm/crm-touch"
import {
  FreshnessNote,
  OrgAvatar,
  OrgPlanChip,
  QuietTag,
  StatTile,
  UserCards,
  UsersTable,
  type TileState,
} from "@/components/crm/accounts/account-parts"

export const ACCOUNTS_TITLE = "Accounts"
export const ACCOUNTS_HINT =
  "Organizations come from Stripe and the CRM's contacts. Connect Stripe and the CRM database and they show here."
export const NO_ORGS_TITLE = "No organizations yet"
export const SEARCH_PLACEHOLDER = "Search organizations or users…"

export function noMatchTitle(q: string) {
  return `No organizations or users match “${q.trim()}”`
}

/** The page's instant, refreshed each minute so "Last updated 5m ago" keeps moving. */
function useNowMs() {
  const [nowMs, setNowMs] = React.useState(() => now().getTime())
  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(now().getTime()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return nowMs
}

/**
 * Accounts (`/crm/accounts`): organizations and the users attached to each.
 * Summary tiles, search (orgs and users), tabs, and one row per
 * organization, always A to Z by name, that expands to its users. Users whose
 * Stripe customer has no organization have their own row and tab. Real data
 * only: before Stripe and the CRM database answer it is Connecting…; without
 * them it is Not connected, never sample rows. Below 1280 (where every CRM control is a 44px target) the table becomes
 * stacked cards.
 */
export function AccountsScreen() {
  const view = useCrmAccounts()
  const nowMs = useNowMs()
  const params = useSearchParams()
  const [tab, setTab] = React.useState<AccountTab>(() => {
    const t = params.get("tab")
    return isAccountTab(t) ? t : "all"
  })
  const [q, setQ] = React.useState(() => params.get("q") ?? "")
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set())

  const data = view.phase === "ready" ? view.data : null
  const live = data !== null && (data.status === "connected" || data.status === "stale")
  const tileState: TileState =
    view.phase === "unauthorized"
      ? "unauthorized"
      : !data || data.status === "connecting"
        ? "loading"
        : data.status === "not_connected"
          ? "not_connected"
          : "live"

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 md:px-6" data-testid="accounts-screen">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{ACCOUNTS_TITLE}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Organizations from Stripe and the CRM, with the users attached to each.</p>
      </div>

      <SummaryTiles data={live ? data : null} state={tileState} />

      {view.phase === "unauthorized" ? (
        <CrmSessionExpired />
      ) : !data || data.status === "connecting" ? (
        <AccountsSkeleton />
      ) : data.status === "not_connected" ? (
        <>
          <NotConnectedPanel title={ACCOUNTS_TITLE} hint={ACCOUNTS_HINT} testId="accounts-not-connected" />
          <FreshnessNote {...data} nowMs={nowMs} />
        </>
      ) : (
        <LiveAccounts
          data={data}
          nowMs={nowMs}
          tab={tab}
          setTab={setTab}
          q={q}
          setQ={setQ}
          expanded={expanded}
          toggle={toggle}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ tiles */

function SummaryTiles({ data, state }: { data: AccountsResponse | null; state: TileState }) {
  const t = data ? accountsTotals(data) : null
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—")
  const contacts = data ? data.stripeContacts : 0
  return (
    <section aria-label="Accounts summary" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatTile
        testId="tile-organizations"
        label="Organizations"
        state={state}
        icon={<Building2Icon aria-hidden className="size-4" />}
        value={t?.organizations ?? 0}
        sub={t ? (t.organizations === 0 ? "none yet" : `${t.canceledOrgs} canceled`) : null}
      />
      <StatTile
        testId="tile-users-attached"
        label="Users attached"
        state={state}
        icon={<UsersIcon aria-hidden className="size-4" />}
        value={t?.usersAttached ?? 0}
        sub={t ? (t.usersAttached + t.usersNoOrg === 0 ? "no users yet" : `${pct(t.usersAttached, t.usersAttached + t.usersNoOrg)} of users with an org`) : null}
      />
      <StatTile
        testId="tile-users-no-org"
        label="Users with no org"
        state={state}
        icon={<UserRoundXIcon aria-hidden className="size-4" />}
        value={t?.usersNoOrg ?? 0}
        sub={data ? `of ${contacts.toLocaleString("en-US")} Stripe contacts` : null}
      />
    </section>
  )
}

function AccountsSkeleton() {
  return (
    <div aria-busy="true" data-testid="accounts-skeleton" className="flex flex-col gap-2 rounded-xl border p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- live */

type LiveProps = {
  data: AccountsResponse
  nowMs: number
  tab: AccountTab
  setTab: (t: AccountTab) => void
  q: string
  setQ: (q: string) => void
  expanded: ReadonlySet<string>
  toggle: (id: string) => void
}

function LiveAccounts({ data, nowMs, tab, setTab, q, setQ, expanded, toggle }: LiveProps) {
  const totals = accountsTotals(data)
  const shown = visibleAccounts(data, { tab, q })
  const searching = q.trim().length > 0
  const nothing = shown.orgs.length === 0 && shown.noOrgUsers.length === 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-72">
          <SearchIcon aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            aria-label="Search organizations or users"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            className={cn("h-9 pl-8!", CRM_44)}
          />
        </div>
        <AccountTabs tab={tab} setTab={setTab} totals={totals} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted-foreground tracking-tight">
          {data.stripeContacts.toLocaleString("en-US")} contacts imported from Stripe · grouped by organization
        </p>
        <FreshnessNote {...data} nowMs={nowMs} />
      </div>

      {totals.organizations === 0 && tab !== "no_org" && !searching ? (
        <EmptyPanel
          icon={<Building2Icon aria-hidden className="size-5" />}
          title={NO_ORGS_TITLE}
          testId="accounts-empty"
          body={`None of the ${data.stripeContacts.toLocaleString("en-US")} Stripe contacts belong to an organization yet. Assign one in Chlk, or add organization metadata to the Stripe customer.`}
        >
          {totals.usersNoOrg > 0 ? (
            <Button variant="outline" className={CRM_44} onClick={() => setTab("no_org")}>
              View {totals.usersNoOrg.toLocaleString("en-US")} users with no org
            </Button>
          ) : null}
        </EmptyPanel>
      ) : nothing ? (
        searching ? (
          <EmptyPanel
            icon={<SearchIcon aria-hidden className="size-5" />}
            title={noMatchTitle(q)}
            testId="accounts-no-results"
            body="Check the spelling, or search by email domain."
          >
            <Button variant="outline" className={CRM_44} onClick={() => setQ("")}>
              <XIcon aria-hidden />
              Clear search
            </Button>
            {tab !== "all" ? (
              <Button variant="ghost" className={CRM_44} onClick={() => setTab("all")}>
                Show all organizations
              </Button>
            ) : null}
          </EmptyPanel>
        ) : (
          <EmptyPanel
            icon={<Building2Icon aria-hidden className="size-5" />}
            title={tab === "no_org" ? "Every user has an organization" : `No organizations in ${ACCOUNT_TABS.find((t) => t.id === tab)!.label}`}
            testId="accounts-tab-empty"
            body="Try another tab."
          />
        )
      ) : tab === "no_org" ? (
        <NoOrgList users={shown.noOrgUsers} total={totals.usersNoOrg} />
      ) : (
        <>
          <OrgTable
            orgs={shown.orgs}
            noOrgCount={shown.noOrgUsers.length}
            expanded={expanded}
            toggle={toggle}
            onNoOrg={() => setTab("no_org")}
          />
          <OrgCards
            orgs={shown.orgs}
            noOrgCount={shown.noOrgUsers.length}
            expanded={expanded}
            toggle={toggle}
            onNoOrg={() => setTab("no_org")}
          />
          <p className="text-caption text-muted-foreground tracking-tight" data-testid="accounts-showing">
            Showing {shown.orgs.length.toLocaleString("en-US")} of {totals.organizations.toLocaleString("en-US")} organizations
          </p>
        </>
      )}
    </>
  )
}

function AccountTabs({ tab, setTab, totals }: { tab: AccountTab; setTab: (t: AccountTab) => void; totals: ReturnType<typeof accountsTotals> }) {
  return (
    <div className="max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] max-md:w-full [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label="Organization filter" className="bg-muted flex w-fit items-center gap-0.5 rounded-lg p-[3px]">
        {ACCOUNT_TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "text-body flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 whitespace-nowrap transition-colors max-xl:h-11 max-xl:min-w-11 max-xl:px-3",
                active ? "bg-surface text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="md:hidden">{t.short}</span>
              <span className="max-md:hidden">{t.label}</span>
              <span className="text-muted-foreground text-[0.7rem] tabular-nums">{tabCount(totals, t.id).toLocaleString("en-US")}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyPanel({
  icon,
  title,
  body,
  testId,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  testId: string
  children?: React.ReactNode
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="bg-surface border-surface-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border px-4 py-12 text-center"
    >
      <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">{icon}</span>
      <p className="text-label font-semibold tracking-tight">{title}</p>
      <p className="text-caption text-muted-foreground max-w-prose tracking-tight">{body}</p>
      {children ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </section>
  )
}

/* ------------------------------------------------------------------ table */

function OrgTable({
  orgs,
  noOrgCount,
  expanded,
  toggle,
  onNoOrg,
}: {
  orgs: AccountOrg[]
  noOrgCount: number
  expanded: ReadonlySet<string>
  toggle: (id: string) => void
  onNoOrg: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border max-xl:hidden">
      <table aria-label="Organizations" className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr className="border-b">
            <th className="w-10 px-2 py-2" aria-label="Expand" />
            <th className="px-2 py-2 font-medium" aria-sort="ascending">
              Organization
            </th>
            <th className="px-2 py-2 text-right font-medium">Users</th>
            <th className="px-2 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 text-right font-medium">MRR</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const open = expanded.has(o.id)
            const panelId = `org-users-${o.id}`
            return (
              <React.Fragment key={o.id}>
                <tr data-testid="org-row" className={cn("hover:bg-muted/40 border-b", open && "bg-muted/40")}>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      aria-label={`${open ? "Hide" : "Show"} users of ${o.name}`}
                      onClick={() => toggle(o.id)}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md"
                    >
                      {open ? <ChevronDownIcon aria-hidden className="size-4" /> : <ChevronRightIcon aria-hidden className="size-4" />}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <OrgAvatar name={o.name} />
                      <span className="flex min-w-0 flex-col">
                        <Link href={`/crm/accounts/${encodeURIComponent(o.id)}`} className="truncate font-medium hover:underline">
                          {o.name}
                        </Link>
                        {o.domain ? <span className="text-muted-foreground truncate text-xs">{o.domain}</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{o.users.length}</td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <OrgPlanChip org={o} />
                      {o.canceled ? <QuietTag>Canceled</QuietTag> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{o.canceled ? "—" : formatMrr(o.mrrCents)}</td>
                </tr>
                {open ? (
                  <tr id={panelId} className="bg-muted/20 border-b">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-caption text-muted-foreground">
                          {o.users.length} {o.users.length === 1 ? "user" : "users"} attached to {o.name}
                        </p>
                        <Link
                          href={`/crm/accounts/${encodeURIComponent(o.id)}`}
                          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        >
                          <ArrowRightIcon aria-hidden className="size-4" />
                          Open organization
                        </Link>
                      </div>
                      {o.users.length > 0 ? (
                        <UsersTable users={o.users} label={`Users of ${o.name}`} className="bg-background" />
                      ) : (
                        <p className="text-caption text-muted-foreground">No users attached yet.</p>
                      )}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
          {noOrgCount > 0 ? (
            <tr data-testid="no-org-row">
              <td className="px-2 py-2" />
              <td className="px-2 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-muted-foreground flex size-8 items-center justify-center">
                    <UserRoundXIcon aria-hidden className="size-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">No organization</span>
                    <span className="text-muted-foreground text-xs">Users whose Stripe customer has no org</span>
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{noOrgCount.toLocaleString("en-US")}</td>
              <td className="px-3 py-2 text-right" colSpan={2}>
                <button type="button" onClick={onNoOrg} className="text-info-text inline-flex items-center gap-1 text-sm font-medium hover:underline">
                  Filter
                  <ArrowRightIcon aria-hidden className="size-3.5" />
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ cards */

const PHONE_USERS = 3

function OrgCards({
  orgs,
  noOrgCount,
  expanded,
  toggle,
  onNoOrg,
}: {
  orgs: AccountOrg[]
  noOrgCount: number
  expanded: ReadonlySet<string>
  toggle: (id: string) => void
  onNoOrg: () => void
}) {
  return (
    <ul aria-label="Organizations" className="divide-border flex flex-col divide-y overflow-hidden rounded-xl border xl:hidden">
      {orgs.map((o) => {
        const open = expanded.has(o.id)
        const panelId = `org-card-users-${o.id}`
        return (
          <li key={o.id} data-testid="org-card" className={cn(open && "bg-muted/30")}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(o.id)}
              className="flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left"
            >
              <OrgAvatar name={o.name} className="size-9" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{o.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {o.users.length} {o.users.length === 1 ? "user" : "users"}
                  </span>
                  <OrgPlanChip org={o} />
                  {o.canceled ? <QuietTag>Canceled</QuietTag> : null}
                </span>
              </span>
              {open ? (
                <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="sr-only">{open ? "Hide users" : "Show users"}</span>
            </button>
            {open ? (
              <div id={panelId} className="px-3 pb-3 pl-15">
                {o.users.length > 0 ? <UserCards users={o.users.slice(0, PHONE_USERS)} label={`Users of ${o.name}`} /> : null}
                <Link
                  href={`/crm/accounts/${encodeURIComponent(o.id)}`}
                  className={cn("text-info-text inline-flex min-h-11 items-center gap-1 text-sm font-medium", CRM_LINK_44)}
                >
                  {o.users.length > PHONE_USERS ? `+${o.users.length - PHONE_USERS} more · ` : ""}Open organization
                  <ArrowRightIcon aria-hidden className="size-3.5" />
                </Link>
              </div>
            ) : null}
          </li>
        )
      })}
      {noOrgCount > 0 ? (
        <li data-testid="no-org-card">
          <button type="button" onClick={onNoOrg} className="flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left">
            <span className="text-muted-foreground flex size-9 items-center justify-center">
              <UserRoundXIcon aria-hidden className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">No organization</span>
              <span className="text-muted-foreground text-sm">{noOrgCount.toLocaleString("en-US")} users</span>
            </span>
            <ChevronRightIcon aria-hidden className="text-muted-foreground size-4" />
          </button>
        </li>
      ) : null}
    </ul>
  )
}

/* ----------------------------------------------------------------- no org */

function NoOrgList({ users, total }: { users: AccountUser[]; total: number }) {
  return (
    <>
      <section data-testid="no-org-banner" className="bg-surface border-surface-border flex items-start gap-3 rounded-xl border px-4 py-3">
        <UserRoundXIcon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div>
          <p className="text-label font-semibold tracking-tight">
            {total.toLocaleString("en-US")} {total === 1 ? "user has" : "users have"} no organization
          </p>
          <p className="text-caption text-muted-foreground tracking-tight">
            Their Stripe customer has no organization. Assign one in Chlk to roll them up into an account.
          </p>
        </div>
      </section>
      <UsersTable users={users} label="Users with no organization" className="max-xl:hidden" />
      <div className="rounded-xl border px-3 xl:hidden">
        <UserCards users={users} label="Users with no organization" />
      </div>
      <p className="text-caption text-muted-foreground tracking-tight">
        Showing {users.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
    </>
  )
}
