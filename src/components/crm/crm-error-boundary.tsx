"use client"

import * as React from "react"

import { CrmErrorAlert } from "@/components/crm/crm-error-alert"
import { useCrm } from "@/components/crm/crm-store"

type CatcherProps = {
  children: React.ReactNode
  onReset: () => void
}

type CatcherState = {
  error: (Error & { digest?: string }) | null
}

/**
 * Client boundary inside CrmProvider. A throw in the shell or a screen
 * lands here (the route `error.tsx` never sees it if the provider sat in
 * layout). Reset calls `resetDemoData()` so memory is the seed and the
 * storage key stays empty — not a stale write of the crashed copy.
 */
class CrmErrorCatcher extends React.Component<CatcherProps, CatcherState> {
  state: CatcherState = { error: null }

  static getDerivedStateFromError(error: Error): CatcherState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("[crm] render failed", error)
  }

  render() {
    if (this.state.error) {
      return (
        <CrmErrorAlert
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
          onReset={() => {
            this.props.onReset()
            this.setState({ error: null })
          }}
        />
      )
    }
    return this.props.children
  }
}

export function CrmErrorBoundary({ children }: { children: React.ReactNode }) {
  const store = useCrm()
  return <CrmErrorCatcher onReset={() => store.resetDemoData()}>{children}</CrmErrorCatcher>
}
