// FILL IN AT BUILD TIME — the Chlk production schema was unknown when this
// was written. Point `query` at whatever holds user profiles, and keep the
// aliased output columns named exactly as below.
//
// Required: email. Everything else is optional — any column you leave out
// of the query simply doesn't appear on the customer profile.
//
//   email        the address that matches a CRM contact
//   first_name   \
//   last_name     } identity, subject to the name-source precedence rules
//   org_name     /
//   app_user_id  the Chlk user id, shown on the profile for support lookups
//   signup_at    when they created their account (timestamp or ISO string)
//   last_active_at  their most recent activity
//
// Anything listed in `extras` is read from the same query and shown as a
// labelled row in the profile's Product usage card, so you can surface
// Chlk-specific fields (team, role, seat count…) without code changes.
export const chlkMapping = {
  query: /* sql */ `
    select
      email          as email,
      first_name     as first_name,
      last_name      as last_name,
      org_name       as org_name,
      id             as app_user_id,
      created_at     as signup_at,
      last_seen_at   as last_active_at
    from public.users
  `,
  /** Extra column names from the query above, rendered as-is. */
  extras: [] as string[],
  /** Human labels for `extras`; falls back to a prettified column name. */
  extraLabels: {} as Record<string, string>,
}

export type SupabaseProfileRow = {
  email: string | null
  first_name?: string | null
  last_name?: string | null
  org_name?: string | null
  app_user_id?: string | number | null
  signup_at?: string | number | Date | null
  last_active_at?: string | number | Date | null
} & Record<string, unknown>
