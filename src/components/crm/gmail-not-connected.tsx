import { NotConnectedPanel } from "@/components/not-connected-panel"

export const GMAIL_HINT =
  "Connect the support inbox (Gmail) in Settings › Connected data and its conversations show here."

/** What each CRM screen would show from the support inbox. */
export const GMAIL_PANEL_TITLES = {
  overview: "Support inbox conversations",
  cases: "Cases from the support inbox",
  contacts: "People who email the support inbox",
  triage: "Unknown senders from the support inbox",
} as const

/**
 * The CRM's stand-in while Gmail is not connected: the shared Not
 * connected panel, never sample conversations in its place.
 */
export function GmailNotConnected({
  screen,
  className,
}: {
  screen: keyof typeof GMAIL_PANEL_TITLES
  className?: string
}) {
  return (
    <NotConnectedPanel
      title={GMAIL_PANEL_TITLES[screen]}
      hint={GMAIL_HINT}
      testId="crm-not-connected"
      className={className}
    />
  )
}
