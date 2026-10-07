import { Suspense } from "react"

import { now } from "@/lib/clock"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { WorkplacePersistenceNote } from "@/components/agent-workplace/workplace-persistence-note"
import { BugsScreen } from "@/components/bugs/bugs-screen"

export const metadata = {
  title: "Bugs · Chlk",
}

// Rendered per request, never at build, so now() is the request's instant.
export const dynamic = "force-dynamic"

export default function BugsPage() {
  // The one read of the clock for this request. The Workplace store holds it
  // and every bug's age and the crash card's week are measured from it, on
  // the server and in the browser alike; Reset moves it through the store.
  const nowMs = now().getTime()

  return (
    // The same store and the same saved copy as Agent Workplace: Bugs is a
    // view of that board, not a second list.
    <IssuesProvider nowMs={nowMs}>
      <div className="flex min-w-0 flex-col gap-2.5">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display-sm font-semibold tracking-tight">Bugs</h1>
            <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
              Yo-Yo&apos;s page. Coach-reported and crashes.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Edits here are Workplace edits, so the note is the Workplace's. */}
            <WorkplacePersistenceNote />
            <span className="text-muted-foreground border-surface-border bg-surface rounded-md border border-dashed px-2 py-[5px] text-[10px] font-semibold tracking-[0.07em] uppercase">
              Dummy / design mock
            </span>
          </div>
        </header>
        {/* BugsScreen reads the open ticket from the URL, so it needs a
            Suspense boundary around useSearchParams. */}
        <Suspense fallback={null}>
          <BugsScreen />
        </Suspense>
      </div>
    </IssuesProvider>
  )
}
