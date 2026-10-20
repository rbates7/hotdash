"use client"

import { NotConnectedPanel } from "@/components/not-connected-panel"

export const AUTOPILOTS_HINT =
  "No scheduler is connected yet. Scheduled agent runs will be listed here, with their next and last run, once one is."

/**
 * The Autopilots tab. There is no scheduler behind it yet, so it says Not
 * connected rather than listing assumed schedules (Rashad's Oct 16 rule:
 * no made-up rows).
 */
export function AutopilotsPanel() {
  return <NotConnectedPanel title="Autopilots" hint={AUTOPILOTS_HINT} testId="autopilots-not-connected" />
}
