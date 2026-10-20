/**
 * The ids the old Feature Request sample used (`fr-1`…`fr-10`), written out
 * so the browser bundle carries none of the sample's cards
 * (`@/lib/feature-requests/fixture` is for tests). The store drops a card
 * with one of these ids that is still the untouched sample (saved with
 * `sample: true`) from a copy saved before the sample was removed; a card
 * whose words the founder rewrote lost that flag and is theirs, so it stays.
 * New ideas start past these ids.
 */
export const SEED_REQUEST_IDS: ReadonlySet<string> = new Set([
  "fr-1",
  "fr-2",
  "fr-3",
  "fr-4",
  "fr-5",
  "fr-6",
  "fr-7",
  "fr-8",
  "fr-9",
  "fr-10",
])
