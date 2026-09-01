import type { Metadata } from "next"

import { GoogleDisconnectButton } from "@/components/settings/google-disconnect-button"
import { RefreshButton } from "@/components/sync/refresh-button"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDb } from "@/lib/db/client"
import { getGoogleConnection } from "@/lib/gmail/client"
import { listRuns } from "@/lib/sync/runner"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Settings" }
export const dynamic = "force-dynamic"

function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  const color =
    tone === "ok"
      ? "bg-chart-2"
      : tone === "warn"
        ? "bg-chart-4"
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
  const runs = listRuns(db, undefined, 10)
  const stripeConfigured = Boolean(process.env.STRIPE_API_KEY)
  const supabaseConfigured = Boolean(process.env.SUPABASE_DB_URL)

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connections and sync status.
      </p>

      {googleError ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Google authorization failed: {googleError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
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
                  : `Connected as ${google.accountEmail ?? "unknown account"}`
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
                ? "Configured via STRIPE_API_KEY."
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
                ? "Configured via SUPABASE_DB_URL."
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
          <CardHeader>
            <CardTitle>Recent sync runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {runs.map((run) => (
                  <li key={run.id} className="flex items-center gap-2">
                    <StatusDot
                      tone={
                        run.status === "success"
                          ? "ok"
                          : run.status === "error"
                            ? "warn"
                            : "off"
                      }
                    />
                    <span className="w-20 font-medium">{run.source}</span>
                    <span className="w-16 text-muted-foreground">
                      {run.status}
                    </span>
                    <span className="text-muted-foreground">
                      {run.startedAt.toLocaleString()}
                    </span>
                    {run.message ? (
                      <span className="truncate text-muted-foreground">
                        — {run.message}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
