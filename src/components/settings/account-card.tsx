import { LogOutIcon } from "lucide-react"

import { SIGN_OUT_PATH } from "@/lib/auth/paths"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const ACCOUNT_HEADING = "Account"
export const SIGN_OUT_LABEL = "Sign out"

/**
 * Settings → Account: who is signed in, and a Sign out that POSTs (a GET
 * link could be triggered by a prefetch or an <img>).
 */
export function AccountCard({ email }: { email: string }) {
  return (
    <Card aria-labelledby="settings-account" role="region">
      <CardHeader>
        <CardTitle>
          <h2 id="settings-account">{ACCOUNT_HEADING}</h2>
        </CardTitle>
        <CardDescription>The one account that can open this dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <dl className="grid min-w-0 gap-0.5">
          <dt className="text-muted-foreground text-label">Signed in as</dt>
          <dd className="truncate text-sm font-medium" data-testid="account-email">
            {email}
          </dd>
        </dl>
        <form action={SIGN_OUT_PATH} method="post" className="shrink-0">
          <Button
            type="submit"
            variant="outline"
            // 44px under 1280 (phone + tablet); Nova's h-8 needs `!` to lose.
            className="w-full max-xl:h-11! md:w-auto"
          >
            <LogOutIcon aria-hidden />
            {SIGN_OUT_LABEL}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
