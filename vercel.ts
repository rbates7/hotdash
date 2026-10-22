import type { VercelConfig } from "@vercel/config/v1"

export const config: VercelConfig = {
  crons: [
    { path: "/api/crm/sync/gmail", schedule: "*/10 * * * *" },
    { path: "/api/crm/sync/stripe", schedule: "15 * * * *" },
    { path: "/api/crm/sync/supabase", schedule: "30 3 * * *" },
  ],
}
