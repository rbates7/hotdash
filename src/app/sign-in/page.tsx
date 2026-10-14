import { redirect } from "next/navigation"
import { LockIcon } from "lucide-react"

import { getAuthConfig } from "@/lib/auth/config"
import { AUTH_COPY } from "@/lib/auth/messages"
import { HOME_PATH } from "@/lib/auth/paths"
import { DEFAULT_NEXT, safeNext } from "@/lib/auth/safe-next"
import { getSession } from "@/lib/auth/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignInForm } from "./sign-in-form"

export const metadata = {
  title: "Sign in · Chlk",
}

// Reads env and the session cookie per request.
export const dynamic = "force-dynamic"

/** Outside the (dashboard) group on purpose: no sidebar or top bar here. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // The proxy already sends a signed-in visitor Home; this is the backstop.
  if (await getSession()) redirect(HOME_PATH)

  const raw = (await searchParams).next
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw)
  const configured = getAuthConfig() !== null

  return (
    <main className="flex min-h-svh items-center justify-center p-4 md:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          </CardTitle>
          <CardDescription>Chlk founder dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {configured ? (
            <SignInForm next={next === DEFAULT_NEXT ? null : next} />
          ) : (
            <div role="alert" className="flex items-start gap-3 rounded-lg border p-3">
              <LockIcon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="grid gap-1 text-sm">
                <p className="font-medium">{AUTH_COPY.notConfiguredTitle}</p>
                <p className="text-muted-foreground">
                  Nobody can sign in until ADMIN_EMAIL, ADMIN_PASSWORD_HASH and AUTH_SECRET are
                  set on the server. See .env.example.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
