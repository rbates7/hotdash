/**
 * How Chlk's own subscription table splits by payment method and status,
 * and how many Apple subscribers the CRM cannot see as paying.
 *
 *   pnpm crm:subscriptions
 *
 * Read-only, and it prints counts only — never a row of customer data. The
 * CRM learns who is paying from Stripe, so anyone who bought through the
 * App Store looks like they never paid. This sizes that gap so a later
 * round can decide what to do about it; nothing here changes the CRM.
 *
 * Needs the read-only role to see two more tables. In the Supabase SQL
 * editor:
 *
 *   grant select on chlk.subscriptions, chlk.plans to crm_reader;
 *   create policy crm_reader_read on chlk.subscriptions for select to crm_reader using (true);
 *   create policy crm_reader_read on chlk.plans         for select to crm_reader using (true);
 */
import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import postgres from "postgres"

import { loadEnvLocal } from "./load-env"

loadEnvLocal()

const GRANT_HELP = `
Run this in the Supabase SQL editor, then try again:

  grant select on chlk.subscriptions, chlk.plans to crm_reader;
  create policy crm_reader_read on chlk.subscriptions for select to crm_reader using (true);
  create policy crm_reader_read on chlk.plans         for select to crm_reader using (true);
`

// Statuses that read as "currently paying" in most billing tables; the
// breakdown printed first shows the real values, so adjust if they differ.
const PAYING = ["active", "trialing", "trial", "past_due", "grace_period", "billing_retry"]

function line(label: string, value: unknown) {
  console.log(`  ${label.padEnd(44)} ${value == null ? "—" : String(value)}`)
}

async function main() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    console.error("SUPABASE_DB_URL is not set — nothing to read.")
    process.exit(1)
  }
  const sql = postgres(url, { max: 1, prepare: false })
  try {
    const byMethod = await sql<{ method: string; status: string; n: number }[]>`
      select coalesce(method, '(none)') as method,
             coalesce(subscription_status, '(none)') as status,
             count(*)::int as n
      from chlk.subscriptions
      group by 1, 2
      order by 1, 3 desc
    `
    if (byMethod.length === 0) {
      console.log(
        "\nchlk.subscriptions returned no rows. If the table has data, crm_reader needs a read policy on it:" +
          GRANT_HELP
      )
      return
    }

    console.log("\nChlk subscriptions by payment method and status\n")
    let currentMethod = ""
    for (const row of byMethod) {
      if (row.method !== currentMethod) {
        currentMethod = row.method
        console.log(`  ${row.method}`)
      }
      line(`    ${row.status}`, row.n)
    }

    const plans = await sql<
      { title: string | null; kind: string | null; stripe: string | null; apple: string | null }[]
    >`
      select title, kind, stripe_price_id as stripe, apple_product_id as apple
      from chlk.plans
      order by title
    `
    console.log("\nPlans and where they are sold\n")
    for (const plan of plans) {
      const where =
        plan.stripe && plan.apple
          ? "Stripe + Apple"
          : plan.stripe
            ? "Stripe"
            : plan.apple
              ? "Apple only"
              : "neither"
      line(`  ${plan.title ?? "(untitled)"}${plan.kind ? ` (${plan.kind})` : ""}`, where)
    }

    // Apple buyers, by email, so they can be looked up in the CRM. Emails
    // stay in memory; only counts are printed.
    const apple = await sql<{ email: string; status: string | null }[]>`
      select distinct lower(p.email) as email, s.subscription_status as status
      from chlk.subscriptions s
      join chlk.profiles p on p.id = s.user_id
      where lower(coalesce(s.method, '')) like '%apple%'
        and p.email is not null and p.email <> ''
    `
    const paying = new Set(
      apple
        .filter((row) => PAYING.includes((row.status ?? "").toLowerCase()))
        .map((row) => row.email)
    )
    const everyone = new Set(apple.map((row) => row.email))

    console.log("\nApple subscribers\n")
    line("people who ever subscribed through Apple", everyone.size)
    line(`with a status that reads as paying (${PAYING.join("/")})`, paying.size)

    const file = path.resolve(process.env.DATABASE_PATH ?? "./data/crm.db")
    if (!fs.existsSync(file)) {
      console.log(`\nNo CRM database at ${file}, so no cross-check against it.\n`)
      return
    }
    const db = new Database(file, { readonly: true })
    const lookup = db.prepare(
      "select stripe_customer_id, plan_status from contacts where email = ?"
    )
    let inCrm = 0
    let viaStripe = 0
    let showsPaying = 0
    for (const email of paying) {
      const contact = lookup.get(email) as
        | { stripe_customer_id: string | null; plan_status: string | null }
        | undefined
      if (!contact) continue
      inCrm += 1
      if (contact.stripe_customer_id) viaStripe += 1
      if (["active", "trialing", "past_due"].includes(contact.plan_status ?? "")) {
        showsPaying += 1
      }
    }
    db.close()

    console.log("\nOf the Apple subscribers who read as paying\n")
    line("in the CRM at all", inCrm)
    line("also known to Stripe", viaStripe)
    line("shown as paying on Customers today", showsPaying)
    line("invisible to \"paying\" (the gap)", paying.size - showsPaying)
    console.log(
      "\nThe gap is people the CRM's Active view hides. Nothing changes until a later round decides how Apple subscriptions should count.\n"
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string }).code
  const message = error instanceof Error ? error.message : String(error)
  if (code === "42501" || code === "42P01" || /permission denied|does not exist/.test(message)) {
    console.error(`\n${message}${GRANT_HELP}`)
  } else {
    console.error(`\n${message}\n`)
  }
  process.exit(1)
})
