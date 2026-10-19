# Founder Dashboard: Settings Page + Real Data Plan
*Plan only. Nothing gets built until Rashad approves. Build goes through Simmons; Mack reviews every change. No on-demand spend, no Cursor cloud agents.*

## The short version
- **Today every screen shows made-up sample numbers.** I read the code (rbates7/hotdash, main branch). There is no connection to Stripe, PostHog, Sentry, Gmail, or anything else yet. Numbers come from files built into the app. When you edit something (a deal, a contact, a roadmap card), the change is saved only in your own browser, so it doesn't follow you to another device.
- **There's also no sign-in.** Anyone with the link can see the dashboard. This plan originally required the sign-in lock before any real data (step 0). **Superseded:** Decision: keep the dashboard public with real data. Chosen by Rashad on 2026-10-13 at 11:50 PM CT, picked from three options Coulson offered (bring sign-in back first / connect live data without sign-in / wait), after he rolled back sign-in at 8:59 PM CT. Sign-in must come back before anyone else is given access.
- ~~**Recommended order:** lock it down, then Stripe (subscribers and revenue, which also powers the Grand Central ticker), then Sentry, then PostHog, then Gmail, then the rest.~~ **Superseded:** the lock-down step no longer comes first; see [Decision: real data without sign-in](#decision-real-data-without-sign-in) at the end. The rest of the order (Stripe, Sentry, PostHog, Gmail, the rest) stands.
- **Settings v1:** Account, Connected data, Sample data on/off, Appearance, Time zone, Goals and targets.

---

## Part 1: Settings page

### Recommended v1 (small, and it supports the real-data work)
| Item | What you'd see | Why it's in v1 |
|---|---|---|
| **Account** | Your name, email, sign-out | Comes with adding sign-in (step 0) |
| **Connected data** | One row each for Stripe, PostHog, Sentry, and Gmail: connected or not, plus "last synced 4 min ago" | It's how you'll know which numbers are real |
| **Sample data on/off** | One switch: hide placeholder numbers once real data is connected | Stops sample numbers getting mixed up with real ones |
| **Appearance** | Light, dark, or match your device | Already half built in the app, so it's cheap |
| **Time zone** | Central by default | The app already has a shared clock setup, so it's cheap |
| **Goals and targets** | Monthly revenue goal, trial-to-paid target, churn limit | Lets Home and Metrics show on track or behind once Stripe is live |

### Later (v2 and beyond)
- **Sidebar show, hide, or reorder.** This also settles the Infrastructure question. Quicker option: just decide now whether to keep or cut Infrastructure.
- **Default landing screen**
- **Notifications** and **Quiet hours (12–7 AM CT)**. These need a sending service (email or text), so they make sense only once real data can trigger alerts.
- **Spend limits.** Needs billing data from each AI or tool vendor, so it's a bigger job.
- **Team access (Dan, Grace; view-only or full).** Needs sign-in first, then roles.
- **Data export** (spreadsheet download for CRM, metrics, and roadmap)
- **Agents** (who shows in Agent Workplace and their default priorities)

Note: in v1, settings would be saved in the browser, the same way the app saves edits today. Moving them to a small database, so they follow you across devices, belongs with Team access later.

---

## Part 2: Getting real data on each screen

**How every connection works (the same pattern each time):** the dashboard's server, not your browser, holds a **read-only API key** (a password that lets one app read another app's data but not change it). Keys are stored in **Vercel environment variables** (Vercel's locked settings box for secrets), so they never show up in the code or on the page. Data refreshes every few minutes. If a source is down, the screen shows "last updated at…" instead of breaking.

### Step 0: Lock the dashboard (must happen first)
- **What:** add a sign-in so only you, and later invited people, can see it.
- **From you:** approval, and which sign-in to use (Google sign-in with your Chlk account is simplest).
- **Effort:** M

### Screen by screen
| # | Screen | Real source | What you need to do | Effort |
|---|---|---|---|---|
| 1 | **Home** (KPI strip + **subscriber ticker**) | **Stripe** for live subscriber count and monthly revenue; Sentry and PostHog for the other tiles later | Create a **Stripe restricted read-only key** and give approval. The ticker needs this live Stripe total; Deke designs the look. | M (ticker itself S–M) |
| 2 | **Metrics** | Stripe for revenue, MRR, churn, and trial-to-paid; **PostHog** for usage, active coaches, and funnels | Stripe key (same one) plus a **PostHog personal API key, read-only** | L |
| 3 | **System Status** | **Sentry** for errors and crash-free rate; Vercel for deploy status | Sentry read-only auth token. Vercel read access may already exist; please confirm. | M |
| 4 | **Bugs** | Sentry issues, plus the Jira bug list if bugs are tracked there | Sentry token. Tell me: are bugs tracked in **Jira or Notion**? | M |
| 5 | **CRM** | **Gmail** (coach conversations) plus Stripe (who's paying) | Approval to read the Chlk Gmail inbox through Google's read-only access, and which inbox | L |
| 6 | **Sales** | Stripe (trials and conversions) plus CRM; or keep it manual | Decide: auto from Stripe, or keep entering deals by hand | M |
| 7 | **Clinics** | Unclear: Chlk's own app database (Supabase) or Stripe | Tell me where clinic signups live today | M |
| 8 | **Roadmap** | **Jira or Notion** (whichever you actually use) | Pick one, and give a read-only token | M |
| 9 | **Feature Request** | Same tool as Roadmap, or PostHog surveys | Pick the source | M |
| 10 | **Community** | Probably stays manual (or Mailerlite for newsletter numbers) | Decide whether manual is fine | S |
| 11 | **My Desk** | Google Calendar plus Gmail (today's meetings and emails needing replies) | Approval for read-only calendar access | M |
| 12 | **Agent Workplace** | GitHub (public repo, pull requests and checks) plus agent task boards | Likely nothing; the repo is public | M |
| 13 | **Infrastructure** | Vercel plus Supabase status, if you keep it | **Decide: build it or cut it** | S–M |

### Suggested order
1. **Step 0:** sign-in lock. *Was required before any real data; superseded, see the decision below. Sign-in must come back before anyone else is given access.*
2. **Stripe → Home ticker + KPIs** (your top ask; one key powers a lot)
3. **Settings v1** (Connected data and Sample data switch, so you can tell what's real)
4. **Sentry → System Status + Bugs**
5. **PostHog + Stripe → Metrics**
6. **Gmail → CRM, then Sales**
7. **Roadmap, Feature Request, My Desk, Clinics, Agent Workplace**
8. Community and Infrastructure last, or cut

Each step is one screen per change, built by Simmons into the shared work branch (develop), reviewed by Mack, and switched to live only after you look.

### One heads-up on the live link
Earlier we noted that the live site's production setup may not point at the develop branch yet. Before the real-data work ships, someone needs to confirm which branch the live link shows. That's a Vercel settings change, so it needs your OK.

---

## Step 0 status: rolled back (Oct 13, 2026)

The sign-in lock shipped in #38 and was then reverted at Rashad's request (via Coulson, Oct 13, 2026 ~9 PM CT). The dashboard opens with no sign-in again.

**Decision on record:** Rashad chose **email and password** (one allowed account) over Google sign-in for step 0.

**Follow-ups to keep if sign-in returns** (from Mack's review of #38):
- Rate limiting in a shared store (not per-instance memory), plus a per-email cap on failed attempts.
- A session version, so a copied cookie can be revoked without rotating AUTH_SECRET.
- A Secure cookie flag that doesn't depend only on NODE_ENV (e.g. also on the request protocol or the deployment URL).

## Decision: real data without sign-in

**Decision: keep the dashboard public with real data. Chosen by Rashad on 2026-10-13 at 11:50 PM CT, picked from three options Coulson offered (bring sign-in back first / connect live data without sign-in / wait), after he rolled back sign-in at 8:59 PM CT. Sign-in must come back before anyone else is given access.**

## Decision: Gmail in the CRM, customer emails on the public link

**Decision: show the customer emails publicly. Rashad on 2026-10-16 at 9:45 PM CT: "Yes, show the customer emails publicly." Then on 2026-10-18 at 7:50 PM CT, to Coulson: "ship everything", which covers Gmail on the public link, previews included (the `GMAIL_*` variables are on Production and Preview). This is [row 5](#screen-by-screen) (CRM ← Gmail) and [order item 6](#suggested-order) (Gmail → CRM). It follows the Oct 13 decision above to keep the dashboard public with real data. Sign-in must come back before anyone else is given access.**
