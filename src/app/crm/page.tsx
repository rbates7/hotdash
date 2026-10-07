import { now } from "@/lib/clock"
import { CrmApp } from "@/components/crm/crm-app"
import { OverviewScreen } from "@/components/crm/overview-screen"

export default function CrmPage() {
  return (
    <CrmApp nowMs={now().getTime()}>
      <OverviewScreen />
    </CrmApp>
  )
}
