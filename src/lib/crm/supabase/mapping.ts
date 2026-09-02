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
//   affiliation  the school or team they typed in — never an account, but
//                coaches who typed the same one are grouped as a prospect
//
// Anything listed in `extras` is read from the same query and shown as a
// labelled row in the profile's Product usage card, so you can surface
// Chlk-specific fields (team, role, seat count…) without code changes.
export const chlkMapping = {
  // Written against the real Chlk schema (schema `chlk`, discovered with
  // `pnpm crm:schema`).
  //
  // "Team" means being on a staff account. Chlk records that two ways:
  //   - staff_seat_codes: a purchaser buys seats, staff redeem them;
  //   - profiles.organization_id: a row in chlk.organizations, which are
  //     created deliberately (invoiced accounts set up by hand — Texas Tech,
  //     Clemson) rather than per signup.
  // The school name someone typed into their profile is *not* a team — it is
  // kept as `affiliation` for context and never creates an account. A seat
  // account is named after the purchaser's organization when there is one,
  // else after the purchaser; an organization-linked account after the
  // organization.
  query: /* sql */ `
    with seat_members as (
      select redeemed_by_user_id as user_id,
             purchaser_user_id,
             'member' as staff_role
      from chlk.staff_seat_codes
      where redeemed_by_user_id is not null
        and lower(coalesce(status, '')) not in
          ('revoked', 'canceled', 'cancelled', 'expired', 'removed')
      union all
      select purchaser_user_id, purchaser_user_id, 'purchaser'
      from chlk.staff_seat_codes
      where purchaser_user_id is not null
    ),
    membership as (
      select distinct on (user_id) user_id, purchaser_user_id, staff_role
      from seat_members
      order by user_id, (staff_role = 'purchaser') desc
    )
    select
      p.email                                  as email,
      p.first_name                             as first_name,
      p.last_name                              as last_name,
      case
        when m.user_id is not null then
          coalesce(
            porg.name,
            morg.name,
            nullif(trim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '') || ' staff',
            'Staff account ' || left(m.purchaser_user_id::text, 8)
          )
        when p.organization_id is not null then
          morg.name
      end                                      as org_name,
      p.id                                     as app_user_id,
      p.created_at                             as signup_at,
      p.role                                   as role,
      p.organization                           as affiliation,
      coalesce(
        m.staff_role,
        case when p.organization_id is not null then 'member' end
      )                                        as staff_role
    from chlk.profiles p
    left join membership m on m.user_id = p.id
    left join chlk.profiles pp on pp.id = m.purchaser_user_id
    left join chlk.organizations porg on porg.id = pp.organization_id
    left join chlk.organizations morg on morg.id = p.organization_id
    where p.email is not null and p.email <> ''
  `,
  /** Extra column names from the query above, rendered as-is. */
  extras: ["role", "affiliation", "staff_role"] as string[],
  /** Human labels for `extras`; falls back to a prettified column name. */
  extraLabels: {
    role: "Role in Chlk",
    affiliation: "School / team (as entered)",
    staff_role: "Staff account",
  } as Record<string, string>,
}

export type SupabaseProfileRow = {
  email: string | null
  first_name?: string | null
  last_name?: string | null
  org_name?: string | null
  app_user_id?: string | number | null
  signup_at?: string | number | Date | null
  last_active_at?: string | number | Date | null
  affiliation?: string | null
} & Record<string, unknown>

/**
 * In-app feedback: what a coach typed into the feedback form inside Chlk,
 * and the chance-to-recommend score they gave with it. Each row becomes a
 * case (see src/lib/crm/feedback/sync.ts).
 *
 * Columns confirmed against the live table (pnpm crm:schema, 2026-09-02):
 * chlk.feedback has id, email, feedback, chance_to_recommend, created_at.
 * The sender's email is on the row itself; the profile join only supplies
 * a name, so a sender with no profile still becomes a contact.
 *
 *   id          keys the case and the message, so a re-run changes nothing
 *   email       the sender
 *   first_name, last_name   from their profile, when the emails match
 *   message     what they wrote — may be empty when they only gave a score
 *   score       chance_to_recommend, shown as given until its scale is known
 *   created_at  when they sent it
 */
export const feedbackMapping = {
  query: /* sql */ `
    select
      f.id::text                               as id,
      f.email                                  as email,
      p.first_name                             as first_name,
      p.last_name                              as last_name,
      f.feedback                               as message,
      f.chance_to_recommend                    as score,
      f.created_at                             as created_at
    from chlk.feedback f
    left join chlk.profiles p on lower(p.email) = lower(f.email)
    where f.email is not null and f.email <> ''
  `,
}

export type SupabaseFeedbackRow = {
  id: string | number | null
  email: string | null
  first_name?: string | null
  last_name?: string | null
  message: string | null
  score?: number | string | null
  created_at: string | number | Date | null
} & Record<string, unknown>
