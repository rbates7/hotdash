import { redirect } from "next/navigation"

import { SIGN_IN_PATH } from "@/lib/auth/paths"
import { getSession } from "@/lib/auth/server"
import { AccountCard } from "@/components/settings/account-card"

export const metadata = {
  title: "Settings · Chlk",
}

// The signed-in email comes from this request's cookie.
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect(`${SIGN_IN_PATH}?next=/settings`)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-display-sm font-semibold tracking-tight">Settings</h1>
        <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
          Your account and how the dashboard behaves
        </p>
      </header>
      <AccountCard email={session.sub} />
    </div>
  )
}
