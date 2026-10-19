"use client"

import { useSettings } from "@/hooks/use-settings"

/**
 * Renders the sample-data surfaces only while Settings › Sample data is on.
 * The server and the first client render always show them (the default),
 * so hydration matches; a founder who turned them off sees them go once
 * the browser's settings are read.
 */
export function SampleDataGate({ children }: { children: React.ReactNode }) {
  const { sampleData } = useSettings()
  return sampleData ? children : null
}
