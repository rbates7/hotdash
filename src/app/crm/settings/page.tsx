import type { Metadata } from "next"

import { GoogleDisconnectButton } from "@/components/crm/google-disconnect-button"
import { SyncPauseToggle } from "@/components/crm/sync-pause-toggle"
import { RefreshButton } from "@/components/crm/refresh-button"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDb } from "@/lib/crm/db/client"
import { syncState } from "@/lib/crm/db/schema"
import { getGoogleConnection } from "@/lib/crm/gmail/client"
import { isSyncPaused } from "@/lib/crm/settings/server"
import { listRuns } from "@/lib/crm/sync/runner"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "CRM Settings · Chlk" }
export const dynamic = "force-dynamic"

function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  const color =
    tone === "ok"
      ? "bg-success"
      : tone === "warn"
        ? "bg-warning"
        : "bg-muted-foreground/40"
  return <span className={cn("inline-block size-2 rounded-full", color)} />
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string }>
}) {
  const { google_error: googleError } = await searchParams
  const db = getDb()
  const google = getGoogleConnection(db)
  const runs = listRuns(db, undefined, 15)
  const paused = isSyncPaused(db)
  const stateRows = db.select().from(syncState).all()
  const lastSyncedBySource = new Map(
    stateRows.map((row) => [row.source, row.lastSyncedAt])
  )
  const stripeConfigured = Boolean(process.env.STRIPE_API_KEY)
  const supabaseConfigured = Boolean(process.env.SUPABASE_DB_URL)

  const lastSyncedLabel = (source: "gmail" | "stripe" | "supabase") => {
    const at = lastSyncedBySource.get(source)
    return at ? `Last synced ${at.toLocaleString()}.` : "Never synced."
  }

  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-3">
      <p className="text-muted-foreground text-body">
        Connections and sync status.
      </p>

      {googleError ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Google authorization failed: {googleError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusDot
                tone={
                  !google.connected
                    ? "off"
                    : google.errorMessage
                      ? "warn"
                      : "ok"
                }
              />
              Gmail
            </CardTitle>
            <CardDescription>
              {google.connected
                ? google.errorMessage
                  ? google.errorMessage
                  : `Connected as ${google.accountEmail ?? "unknown account"}. ${lastSyncedLabel("gmail")}`
                : "Not connected. Email-to-case needs read access to your inbox."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            {/* Full-page navigation so the OAuth redirect chain works. */}
            <a
              href="/api/google/connect"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {google.connected
                ? google.errorMessage
                  ? "Reconnect"
                  : "Reconnect"
                : "Connect Google"}
            </a>
            {google.connected ? (
              <>
                <RefreshButton source="gmail" label="Sync now" />
                <GoogleDisconnectButton />
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusDot tone={stripeConfigured ? "ok" : "off"} />
              Stripe
            </CardTitle>
            <CardDescription>
              {stripeConfigured
                ? `Configured via STRIPE_API_KEY. ${lastSyncedLabel("stripe")}`
                : "Not configured — set STRIPE_API_KEY to import customers and plans."}
            </CardDescription>
          </CardHeader>
          {stripeConfigured ? (
            <CardContent>
              <RefreshButton source="stripe" label="Sync now" />
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusDot tone={supabaseConfigured ? "ok" : "off"} />
              Supabase enrichment
            </CardTitle>
            <CardDescription>
              {supabaseConfigured
                ? `Configured via SUPABASE_DB_URL. ${lastSyncedLabel("supabase")}`
                : "Not configured — set SUPABASE_DB_URL to enrich contact names and organizations."}
            </CardDescription>
          </CardHeader>
          {supabaseConfigured ? (
            <CardContent>
              <RefreshButton source="supabase" label="Sync now" />
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Sync activity</CardTitle>
            <SyncPauseToggle paused={paused} />
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const duration = run.finishedAt
                      ? `${((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1)}s`
                      : "—"
                    const statsSummary = run.stats
                      ? Object.entries(run.stats)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(", ")
                      : ""
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium">
                          {run.source}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {run.trigger}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot
                              tone={
                                run.status === "success"
                                  ? "ok"
                                  : run.status === "error"
                                    ? "warn"
                                    : "off"
                              }
                            />
                            {run.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {run.startedAt.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {duration}
                        </TableCell>
                        <TableCell className="max-w-64 truncate text-muted-foreground">
                          {run.message ?? statsSummary ?? ""}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
