// The enrichment query: what the CRM reads from the Chlk database to fill in
// who a contact is. Keep the aliased output columns named exactly as below;
// `pnpm crm:schema` shows what the read-only role can see if the schema moves.
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
  // Written against the real Chlk schema (schema `chlk`, discovered with
  // `pnpm crm:schema`). profiles.id is the auth user id, which is where the
  // last sign-in lives; both joins are LEFT so a profile with no org or no
  // auth row still comes through with what it has.
  query: /* sql */ `
    select
      p.email                                  as email,
      p.first_name                             as first_name,
      p.last_name                              as last_name,
      coalesce(o.name, p.organization)         as org_name,
      p.id                                     as app_user_id,
      p.created_at                             as signup_at,
      u.last_sign_in_at                        as last_active_at,
      p.role                                   as role
    from chlk.profiles p
    left join chlk.organizations o on o.id = p.organization_id
    left join auth.users u on u.id = p.id
    where p.email is not null and p.email <> ''
  `,
  /** Extra column names from the query above, rendered as-is. */
  extras: ["role"] as string[],
  /** Human labels for `extras`; falls back to a prettified column name. */
  extraLabels: { role: "Role in Chlk" } as Record<string, string>,
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
