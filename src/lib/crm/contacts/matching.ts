import type { NameSource } from "@/lib/crm/db/schema"

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function splitDisplayName(name: string | null | undefined): {
  firstName: string | null
  lastName: string | null
} {
  const trimmed = (name ?? "").trim().replace(/^"|"$/g, "").trim()
  if (!trimmed) return { firstName: null, lastName: null }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") }
}

// A source may overwrite name/org fields only if it ranks at least as high
// as the source that last wrote them. Manual edits are never clobbered.
const NAME_SOURCE_RANK: Record<NameSource, number> = {
  gmail: 0,
  stripe: 1,
  supabase: 2,
  manual: 3,
}

export function canOverwriteName(
  existing: NameSource | null,
  incoming: NameSource
): boolean {
  if (existing === null) return true
  return NAME_SOURCE_RANK[incoming] >= NAME_SOURCE_RANK[existing]
}
