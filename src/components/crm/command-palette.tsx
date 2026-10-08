"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { InboxIcon, SearchIcon, UserIcon } from "lucide-react"

import { contactDisplayName, searchCrm } from "@/lib/crm/crm"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useCrm } from "@/components/crm/crm-store"

/** A result row: 44 tall below 1280. */
const RESULT =
  "hover:bg-muted flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm max-xl:min-h-11"

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { cases, contacts, organizations } = useCrm()
  const [query, setQuery] = React.useState("")

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) setQuery("")
  }

  const results = query.trim() ? searchCrm(query, cases, contacts, organizations) : { cases: [], contacts: [] }
  const hasResults = results.cases.length > 0 || results.contacts.length > 0

  function go(href: string) {
    handleOpenChange(false)
    router.push(href)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* On a phone the palette stays inside the screen below its 20% offset. */}
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 p-0 max-md:max-h-[calc(80dvh-1rem)] max-md:overflow-y-auto"
      >
        <DialogTitle className="sr-only">Search CRM</DialogTitle>
        <div className="relative border-b">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cases and contacts… (#3, a name, an email)"
            aria-label="Search cases and contacts"
            className="h-12! rounded-none border-0! bg-transparent! pl-11! shadow-none! focus-visible:ring-0 dark:bg-transparent!"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {!query.trim() ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              Type to search. Try a case number like #3.
            </p>
          ) : !hasResults ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">No matches.</p>
          ) : (
            <>
              {results.cases.length > 0 ? (
                <p className="text-muted-foreground px-2 py-1 text-xs">Cases</p>
              ) : null}
              {results.cases.map((item) => {
                const contact = contacts.find((c) => c.id === item.contactId)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(`/crm/cases/${item.id}`)}
                    className={RESULT}
                  >
                    <InboxIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">
                      <span className="text-muted-foreground">#{item.caseNumber}</span>{" "}
                      <span className="font-medium">{item.subject}</span>
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {contact ? contactDisplayName(contact) : ""}
                    </span>
                  </button>
                )
              })}
              {results.contacts.length > 0 ? (
                <p className="text-muted-foreground px-2 py-1 text-xs">Contacts</p>
              ) : null}
              {results.contacts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(`/crm/contacts/${item.id}`)}
                  className={RESULT}
                >
                  <UserIcon className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate font-medium">{contactDisplayName(item)}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">{item.email}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
