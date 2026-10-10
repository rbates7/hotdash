import { now } from "@/lib/clock"
import { CrmApp } from "@/components/crm/crm-app"
import { TriageScreen } from "@/components/crm/triage-screen"

export default function CrmTriagePage() {
  return (
    <CrmApp nowMs={now().getTime()}>
      <TriageScreen />
    </CrmApp>
  )
}
