import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/settings"
import { updateSettings, useSettingsSnapshot } from "@/hooks/use-settings"
import { SampleDataNotice, SampleDataTag } from "@/components/sample-data"
import { fireStorageEvent } from "@/test/storage"

function Probe() {
  const { settings, saved } = useSettingsSnapshot()
  return (
    <p data-testid="probe">
      {settings.timeZone}|{String(saved)}
    </p>
  )
}

describe("useSettings", () => {
  it("reads defaults without writing anything", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|false")
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull()
  })

  it("saves a real change and skips a no-op", () => {
    render(<Probe />)
    act(() => updateSettings((s) => ({ ...s, timeZone: "UTC" })))
    expect(screen.getByTestId("probe")).toHaveTextContent("UTC|true")
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    expect(JSON.parse(raw!).timeZone).toBe("UTC")
    act(() => updateSettings((s) => s))
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(raw)
  })

  it("hears another tab, and falls back to defaults when it clears the key", () => {
    render(<Probe />)
    const theirs = { ...DEFAULT_SETTINGS, timeZone: "America/New_York" as const }
    act(() => {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(theirs))
      fireStorageEvent(SETTINGS_KEY, JSON.stringify(theirs))
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("America/New_York|true")
    act(() => {
      window.localStorage.removeItem(SETTINGS_KEY)
      fireStorageEvent(SETTINGS_KEY, null)
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|false")
  })

  it("ignores a corrupt copy", () => {
    window.localStorage.setItem(SETTINGS_KEY, '{"timeZone":"Mars"}')
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|false")
  })
})

describe("sample-data surfaces have no setting", () => {
  it("stay shown whatever an older stored copy says (the Show Sample data labels switch is gone)", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, sampleData: false }))
    render(
      <>
        <Probe />
        <SampleDataTag />
        <SampleDataNotice />
      </>
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|true")
    expect(screen.getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(screen.getByTestId("sample-data-notice")).toBeInTheDocument()
  })
})
