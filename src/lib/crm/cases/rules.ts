import type { CaseStatus } from "@/lib/crm/db/schema"

export type MessageDirection = "inbound" | "outbound"

export type Transition = {
  status: CaseStatus
  // True only for inbound mail on a closed case — the caller records a
  // "Reopened by email from …" system note.
  reopened: boolean
}

// One case per Gmail thread, forever. Inbound mail pulls a case back toward
// the founder's attention; the founder's reply parks it on the customer.
// A courtesy outbound on a closed case does not reopen it.
export function transitionOnMessage(
  status: CaseStatus,
  direction: MessageDirection
): Transition {
  if (direction === "inbound") {
    switch (status) {
      case "new":
        return { status: "new", reopened: false }
      case "open":
        return { status: "open", reopened: false }
      case "waiting":
        return { status: "open", reopened: false }
      case "closed":
        return { status: "open", reopened: true }
    }
  }
  switch (status) {
    case "new":
      return { status: "waiting", reopened: false }
    case "open":
      return { status: "waiting", reopened: false }
    case "waiting":
      return { status: "waiting", reopened: false }
    case "closed":
      return { status: "closed", reopened: false }
  }
}

const SUBJECT_PREFIX = /^\s*(re|fwd?|aw)\s*:\s*/i

export function cleanSubject(subject: string | null | undefined): string {
  let value = (subject ?? "").trim()
  while (SUBJECT_PREFIX.test(value)) {
    value = value.replace(SUBJECT_PREFIX, "")
  }
  value = value.trim()
  return value || "(no subject)"
}
