"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon, InboxIcon, UserIcon } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type Results = {
  cases: {
    id: string
    caseNumber: number
    subject: string
    status: string
    contactName: string
  }[]
  contacts: {
    id: string
    name: string
    email: string
    organization: string | null
  }[]
}

const EMPTY: Results = { cases: [], contacts: [] }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<Results>(EMPTY)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery("")
      setResults(EMPTY)
    }
  }

  React.useEffect(() => {
    if (!open || !query.trim()) return
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/crm/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        setResults((await response.json()) as Results)
      } catch {
        // Aborted or transient.
      }
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query, open])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  const hasResults = results.cases.length > 0 || results.contacts.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 p-0"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="relative border-b">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              const value = event.target.value
              setQuery(value)
              if (!value.trim()) setResults(EMPTY)
            }}
            placeholder="Search cases and contacts… (#42, a name, an email)"
            className="h-12 rounded-none border-0 bg-transparent pl-11 shadow-none focus-visible:ring-0 dark:bg-transparent"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {!query.trim() ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Type to search. Try a case number like #3.
            </p>
          ) : !hasResults ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            <>
              {results.cases.length > 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">Cases</p>
              ) : null}
              {results.cases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(`/crm/cases/${item.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <InboxIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    <span className="text-muted-foreground">
                      #{item.caseNumber}
                    </span>{" "}
                    <span className="font-medium">{item.subject}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {item.contactName}
                  </span>
                </button>
              ))}
              {results.contacts.length > 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Contacts
                </p>
              ) : null}
              {results.contacts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(`/crm/contacts/${item.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {item.email}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
