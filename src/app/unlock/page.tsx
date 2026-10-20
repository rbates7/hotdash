import type { Metadata } from "next"
import Link from "next/link"

import { getGateConfig } from "@/lib/gate/config"
import { LOGIN_PATH } from "@/lib/gate/paths"
import { safeNext } from "@/lib/gate/safe-next"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Sign in · Chlk Founder Dashboard" }

const ERRORS: Record<string, string> = {
  invalid: "That email and password didn't work. Try again.",
  limited: "Too many tries. Wait a few minutes, then try again.",
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = safeNext(typeof params.next === "string" ? params.next : undefined)
  const error = typeof params.error === "string" ? params.error : undefined
  const config = getGateConfig()

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">Chlk Founder Dashboard</h1>
        {config.mode === "misconfigured" ? (
          <p role="alert" className="mt-3 text-sm">
            Sign-in is misconfigured, so the dashboard is locked. One of its two settings is missing; ask whoever
            manages the deployment to set both.
          </p>
        ) : config.mode === "off" ? (
          <p className="mt-3 text-sm">
            Sign-in isn&apos;t turned on here. <Link className="underline" href="/">Open the dashboard</Link>.
          </p>
        ) : (
          <form method="post" action={LOGIN_PATH} className="mt-4 grid gap-3">
            <input type="hidden" name="next" value={next} />
            <label className="grid gap-1 text-sm">
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
            </label>
            {error && ERRORS[error] ? (
              <p role="alert" className="text-sm text-destructive">
                {ERRORS[error]}
              </p>
            ) : null}
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Sign in
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
