"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { CRM_LIMITS, newContactEmailError, type Contact } from "@/lib/crm/crm"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useCrm } from "@/components/crm/crm-store"
import {
  CRM_44,
  CRM_DANGER_TEXT,
  CRM_DIALOG,
  CRM_DIALOG_HEADER,
} from "@/components/crm/crm-touch"

/** First / last name side by side on tablet and desktop, stacked on a phone. */
const PAIR = "grid grid-cols-2 gap-3 max-md:grid-cols-1"

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength,
  autoFocus = false,
  inputRef,
  describedBy,
  invalid = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  maxLength?: number
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  describedBy?: string
  invalid?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label font-medium">
        {label}
      </label>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={CRM_44}
      />
    </div>
  )
}

export function ContactNewDialog({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const { addContact, contacts } = useCrm()
  const [uncontrolled, setUncontrolled] = React.useState(false)
  const open = openProp ?? uncontrolled
  const setOpen = onOpenChange ?? setUncontrolled
  const [email, setEmail] = React.useState("")
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [organizationName, setOrganizationName] = React.useState("")
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const emailErrorId = "new-email-error"

  function reset() {
    setEmail("")
    setFirstName("")
    setLastName("")
    setOrganizationName("")
    setEmailError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      {openProp === undefined && (
        <DialogTrigger render={<Button size="sm" className={CRM_44} />}>
          <PlusIcon aria-hidden />
          New contact
        </DialogTrigger>
      )}
      <DialogContent initialFocus={emailRef} className={CRM_DIALOG}>
        <DialogHeader className={CRM_DIALOG_HEADER}>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>
            Add someone by hand. Most sample contacts arrived from Stripe or triage.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const error = newContactEmailError(
              email,
              contacts.map((c) => c.email)
            )
            if (error) {
              setEmailError(error)
              emailRef.current?.focus()
              return
            }
            addContact({ email, firstName, lastName, organizationName })
            setOpen(false)
            reset()
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Field
              id="new-email"
              label="Email"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value)
                if (emailError) setEmailError(null)
              }}
              required
              maxLength={CRM_LIMITS.email}
              inputRef={emailRef}
              invalid={Boolean(emailError)}
              describedBy={emailError ? emailErrorId : undefined}
            />
            {emailError ? (
              <p
                id={emailErrorId}
                role="alert"
                className={cn("text-destructive text-caption", CRM_DANGER_TEXT)}
              >
                {emailError}
              </p>
            ) : null}
          </div>
          <div className={PAIR}>
            <Field
              id="new-first"
              label="First name"
              value={firstName}
              onChange={setFirstName}
              maxLength={CRM_LIMITS.name}
            />
            <Field
              id="new-last"
              label="Last name"
              value={lastName}
              onChange={setLastName}
              maxLength={CRM_LIMITS.name}
            />
          </div>
          <Field
            id="new-org"
            label="Organization"
            value={organizationName}
            onChange={setOrganizationName}
            maxLength={CRM_LIMITS.org}
          />
          <DialogFooter>
            <Button type="submit" className={CRM_44} disabled={!email.trim()}>
              Create contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Opens from its own Edit button by default. The Contacts list's phone sheet
 * and tablet row menu open the same form from elsewhere: pass `open` and
 * `onOpenChange` to control it (no trigger is rendered then), and
 * `finalFocus` for where focus lands on close.
 */
export function ContactEditDialog({
  contact,
  organizationName,
  open: openProp,
  onOpenChange,
  finalFocus,
}: {
  contact: Contact
  organizationName: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const { updateContact } = useCrm()
  const [uncontrolled, setUncontrolled] = React.useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : uncontrolled
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolled(next)
    onOpenChange?.(next)
  }
  const [first, setFirst] = React.useState(contact.firstName ?? "")
  const [last, setLast] = React.useState(contact.lastName ?? "")
  const [org, setOrg] = React.useState(organizationName ?? "")
  // Start every edit from the contact as it is now, however it was opened.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setFirst(contact.firstName ?? "")
      setLast(contact.lastName ?? "")
      setOrg(organizationName ?? "")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger
          render={<Button size="sm" variant="outline" className={cn(CRM_44, "max-xl:min-w-11")} />}
        >
          Edit
        </DialogTrigger>
      )}
      <DialogContent className={CRM_DIALOG} finalFocus={finalFocus}>
        <DialogHeader className={CRM_DIALOG_HEADER}>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>
            Manual edits win over Stripe and Gmail values once live sync lands.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            updateContact(contact.id, {
              email: contact.email,
              firstName: first,
              lastName: last,
              organizationName: org,
            })
            setOpen(false)
          }}
          className="flex flex-col gap-4"
        >
          <div className={PAIR}>
            <Field
              id="edit-first"
              label="First name"
              value={first}
              onChange={setFirst}
              maxLength={CRM_LIMITS.name}
            />
            <Field
              id="edit-last"
              label="Last name"
              value={last}
              onChange={setLast}
              maxLength={CRM_LIMITS.name}
            />
          </div>
          <Field
            id="edit-org"
            label="Organization"
            value={org}
            onChange={setOrg}
            maxLength={CRM_LIMITS.org}
          />
          <DialogFooter>
            <Button type="submit" className={CRM_44}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
