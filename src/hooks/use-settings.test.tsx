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
      {settings.timeZone}|{String(settings.sampleData)}|{String(saved)}
    </p>
  )
}

describe("useSettings", () => {
  it("reads defaults without writing anything", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|true|false")
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull()
  })

  it("saves a real change and skips a no-op", () => {
    render(<Probe />)
    act(() => updateSettings((s) => ({ ...s, timeZone: "UTC" })))
    expect(screen.getByTestId("probe")).toHaveTextContent("UTC|true|true")
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    expect(JSON.parse(raw!).timeZone).toBe("UTC")
    act(() => updateSettings((s) => s))
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(raw)
  })

  it("hears another tab, and falls back to defaults when it clears the key", () => {
    render(<Probe />)
    const theirs = { ...DEFAULT_SETTINGS, sampleData: false }
    act(() => {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(theirs))
      fireStorageEvent(SETTINGS_KEY, JSON.stringify(theirs))
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|false|true")
    act(() => {
      window.localStorage.removeItem(SETTINGS_KEY)
      fireStorageEvent(SETTINGS_KEY, null)
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|true|false")
  })

  it("ignores a corrupt copy", () => {
    window.localStorage.setItem(SETTINGS_KEY, '{"timeZone":"Mars"}')
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Chicago|true|false")
  })
})

describe("sample-data surfaces follow the setting", () => {
  it("hide when Sample data is off and come back when it is on", () => {
    render(
      <>
        <SampleDataTag />
        <SampleDataNotice />
      </>
    )
    expect(screen.getByTestId("sample-data-tag")).toBeInTheDocument()
    act(() => updateSettings((s) => ({ ...s, sampleData: false })))
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByTestId("sample-data-notice")).toBeNull()
    act(() => updateSettings((s) => ({ ...s, sampleData: true })))
    expect(screen.getByTestId("sample-data-notice")).toBeInTheDocument()
  })
})
