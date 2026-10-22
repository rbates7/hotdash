// Chlk production profile mapping. `organization_id` is authoritative;
// the legacy free-text organization remains a display fallback for users
// who have not been assigned to an organization.
export const chlkMapping = {
  query: /* sql */ `
    select
      p.email                         as email,
      p.first_name                    as first_name,
      p.last_name                     as last_name,
      coalesce(o.name, p.organization) as org_name
    from chlk.profiles p
    left join chlk.organizations o on o.id = p.organization_id
    where p.email is not null
  `,
}

export type SupabaseProfileRow = {
  email: string | null
  first_name: string | null
  last_name: string | null
  org_name: string | null
}
