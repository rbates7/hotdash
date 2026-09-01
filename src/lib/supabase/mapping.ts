// FILL IN AT BUILD TIME — the Chlk production schema was unknown when this
// was written. Point `query` at whatever holds user profiles and org names,
// and keep the aliased output columns exactly as below (email, first_name,
// last_name, org_name). The connection uses a read-only role; only SELECTs.
export const chlkMapping = {
  query: /* sql */ `
    select
      email        as email,
      first_name   as first_name,
      last_name    as last_name,
      org_name     as org_name
    from public.users
  `,
}

export type SupabaseProfileRow = {
  email: string | null
  first_name: string | null
  last_name: string | null
  org_name: string | null
}
