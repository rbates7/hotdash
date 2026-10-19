import { describe, expect, it } from "vitest"

import {
  seedCases,
  seedContacts,
  seedMessages,
  seedNotes,
  seedOrganizations,
} from "@/lib/crm/fixture"
import {
  FIRST_AFTER_SEED,
  SEED_CASE_IDS,
  SEED_CONTACT_IDS,
  SEED_LAST_CASE_NUMBER,
  SEED_MESSAGE_IDS,
  SEED_NOTE_IDS,
  SEED_ORGANIZATION_IDS,
  SEED_THREAD_IDS,
} from "@/lib/crm/seed-ids"

const ids = (rows: readonly { id: string }[]) => new Set(rows.map((r) => r.id))
const highest = (set: ReadonlySet<string>) => Math.max(...[...set].map((id) => Number(id.split("-").pop())))

describe("the literal seed ids", () => {
  it("are exactly the old sample's ids, set by set", () => {
    expect(SEED_ORGANIZATION_IDS).toEqual(ids(seedOrganizations(0)))
    expect(SEED_CONTACT_IDS).toEqual(ids(seedContacts(0)))
    expect(SEED_CASE_IDS).toEqual(ids(seedCases(0)))
    expect(SEED_MESSAGE_IDS).toEqual(ids(seedMessages(0)))
    expect(SEED_NOTE_IDS).toEqual(ids(seedNotes(0)))
    expect(SEED_THREAD_IDS).toEqual(new Set(seedMessages(0).map((m) => m.threadId)))
  })

  it("start every counter one past the sample's highest id and case number", () => {
    expect(SEED_LAST_CASE_NUMBER).toBe(Math.max(...seedCases(0).map((c) => c.caseNumber)))
    expect(FIRST_AFTER_SEED).toEqual({
      org: highest(ids(seedOrganizations(0))) + 1,
      contact: highest(ids(seedContacts(0))) + 1,
      case: highest(ids(seedCases(0))) + 1,
      message: highest(ids(seedMessages(0))) + 1,
      note: highest(ids(seedNotes(0))) + 1,
      caseNumber: SEED_LAST_CASE_NUMBER + 1,
    })
  })
})
