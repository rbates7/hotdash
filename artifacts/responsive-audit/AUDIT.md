# Founder dashboard responsive audit

Audit of current `develop` (`a8a0c70`) at phone **390×844** (sanity **360×740**), tablet portrait **820×1180**, tablet landscape **1180×820**. Light mode unless noted. Desktop **1440×900** was not in the capture set; it is the existing design target and must stay pixel-equivalent.

Figma re-check before the shell PR (2026-10-07, Figma MCP, file `ZB2YTXYhNL26UX6xjvwpFF`, Rashad Bates’s team): still **one page** (`0:1` Page 1). Frames are coach iPad landscape only — Recents / Playbook Library / One Play a Day at **1024×768**. No phone (390) or tablet (820 / 1180) frames for the founder shell or nav. No new pages. **Pending Deke design** — this shell uses the existing desktop tokens (menu button + drawer), not invented compact styling.

## Worst problems first

1. **Phone: no way to open navigation.** The shadcn sidebar already becomes a closed sheet below 768px, but the layout never renders a menu button. `nav[aria-label="Founder dashboard"]` is not visible. Theme, Help, and Logout live in that same unreachable rail. Cmd/Ctrl+B still toggles the hidden sheet — keyboard-only and undiscoverable.
2. **Phone page headers overflow.** Persistence note + sample/dummy chips are `shrink-0` on one row with the title. Title column can collapse (`clientWidth: 0` on Home’s `h1`). Dummy stamp clips to “DUMMY / DESIGN M”. Horizontal page scroll of 12–106px on Home, Feature Request, Product Roadmap, Clinics, CRM, My Desk, Community Development.
3. **Wide tables are clipped, not contained.** Sales, Clinics, Community Development, and Metrics subscriber/expense tables keep all desktop columns. On phone, only the first one or two columns paint; the rest are off-canvas and there is no in-table scroller or stacked-card layout. Row actions are `opacity-60` until `group-hover/row` — hover-only on a touch device.
4. **Kanban boards stay N-columns.** Feature Request is `grid-cols-4`, Product Roadmap `grid-cols-3`. On 390 they squeeze into unreadable ~70px columns and still overflow. Workplace Issues already stacks (`grid-cols-1` / `sm:grid-cols-2`) — the other boards do not.
5. **Tablet portrait: 256px expanded rail eats the screen.** 820 − 256 − 48 padding ≈ 516px for content. Sales/Clinics/Community tables clip columns. Collapse control is `size-6` (24px), well under 44px. No compact header.
6. **Tabs and filter chips overflow.** Workplace (Inbox clipped), Metrics (“Churned Subscribers” clipped), CRM Search (`⌘K`) hangs off the right edge. Many chips/buttons are 22–32px tall.
7. **Micro type (11px) and 22px pills** are everywhere (`text-micro`, SampleDataTag `h-5`, persistence Reset `h-6`). Fine at 1440; small on a phone.

Tablet landscape (1180) is the most usable width: rail + content fit, tables mostly complete. Still has small tap targets and hover-only row menus.

---

## Shell / app chrome

**Shots:** `shell-phone.png`, `shell-phone-dark.png`, `shell-tablet-portrait.png`, `shell-tablet-portrait-dark.png`, `shell-tablet-landscape.png`, `shell-tablet-landscape-dark.png`, `shell-phone-360.png`

- Phone: no sidebar, no menu button, no app header. Theme toggle is inside the closed sheet — dark/light cannot be reached by tap. Next-themes `defaultTheme="dark"` until storage is read.
- Collapse chevron is 24×24 and sits on the rail edge (tablet/desktop only).
- No `SidebarTrigger` is mounted in the layout (`app-sidebar.tsx` even notes it was replaced by the rail chevron).
- Cmd/Ctrl+B toggles the mobile sheet with no visible control and no focus move the user can see.
- `p-6` inset padding (48px) is a lot on 390.

## Home

**Shots:** `home-phone.png`, `home-tablet-portrait.png`, `home-tablet-landscape.png`, `home-phone-360.png`

- Header: title + “Wednesday pulse” crushed; persistence + “Dummy / design mock” clip and force ~34px page overflow (78px at 360).
- KPI numbers (`text-[26px] whitespace-nowrap`) and the sample-data strip sit tight; 360 wraps worse.
- Doors already stack (`grid-cols-1` / `lg:grid-cols-3`) — good. Arrow affordance is `size-7` and hover-tinted (`group-hover/door`).
- Needs-you timestamps are `text-micro`.
- Tablet portrait: rail takes a third of the width; doors stay stacked until `lg`.

## Agent Workplace

**Shots:** `agent-workplace-phone.png`, `agent-workplace-tablet-portrait.png`, `agent-workplace-tablet-landscape.png`

- Issues board stacks on phone (`grid-cols-1`) — one of the better screens.
- Tab list (`Issues … Inbox`) is `overflow-x-auto` on the tab strip but Inbox is clipped at 390; tap targets are line-tabs, ~28px tall.
- Filter chips All/Members/Agents/New and “New issue” are under 44px.
- Ticket view (not captured as a separate route) uses a 2-col property grid (`grid-cols-[5.5rem_1fr]`) that will be tight; dialogs are desktop-sized.
- Header dummy stamp wraps onto its own row and still crowds Reset.

## Metrics

**Shots:** `metrics-phone.png`, `metrics-tablet-portrait.png`, `metrics-tablet-landscape.png`

- Overview cards stack on phone — readable.
- Tab labels clip: “Churned Subscribers” does not fit. Strip scrolls internally; that is easy to miss.
- Card chrome (bar/line/remove) is `opacity-40` until `group-hover/metric` — hover-only.
- New/Churned/Expenses tables (not in the Overview shot) are multi-column; expense row actions are hover-opacity. Need the shared table helper on those tabs.
- Period chip and Reset are small.

## Feature Request

**Shots:** `feature-request-phone.png`, `feature-request-phone-360.png`, `feature-request-tablet-portrait.png`, `feature-request-tablet-landscape.png`

- Forced `grid-cols-4`. On 390 each column is ~70px; card titles wrap per word; page overflow ~12px.
- Tablet portrait next to the 256px rail is still four skinny columns.
- Header: Reset + sample chip + “New idea” wrap; persistence wraps “this browser” onto a second line.
- Idea dialog is a centered desktop dialog — risk of going off 390 once opened (not in the still).

## Product Roadmap

**Shots:** `product-roadmap-phone.png`, `product-roadmap-tablet-portrait.png`, `product-roadmap-tablet-landscape.png`

- Forced `grid-cols-3`. Overflow ~57px on phone. Sample tags sit on top of titles. Move chevrons are tiny and easy to miss.
- “SAMPLE DATA” chip in the header wraps as two lines and crowds “New bet”.
- Same desktop dialog risk as Feature Request.

## Clinics

**Shots:** `clinics-phone.png`, `clinics-tablet-portrait.png`, `clinics-tablet-landscape.png`

- Eight-column table. Phone shows Name only (Date clipped); overflow ~73px. No inner scroller.
- Row `⋯` is `icon-xs` and `opacity-60` until `group-hover/row`.
- Add clinic is a 32px icon button in the header.
- Tablet landscape is the first width where Date / City / Type / Attend / Collected all read; Status still kisses the edge.
- Dialog uses `grid-cols-2` / `grid-cols-[1fr_140px]` — will overflow on phone.

## Sales

**Shots:** `sales-phone.png`, `sales-phone-360.png`, `sales-tablet-portrait.png`, `sales-tablet-landscape.png`

- Eight-column deals table. Phone paints Who + “What they’re buying” and clips Value / Stage / Next step / Owner / Last touch / Actions. `pageOverflowX` measured 0 because the table is clipped by `overflow-hidden` on `TableCard`, not scrolled.
- Actions stay at `opacity-60` until row hover.
- Filter chips Open/Won/Lost/All and “Add deal” are under 44px.
- Deal dialogs use 2-col / `1fr_160px` grids.

## System Status

**Shots:** `system-status-phone.png`, `system-status-tablet-portrait.png`, `system-status-tablet-landscape.png`

- One of the better phone pages: stacked banner + rows, no page overflow.
- Header Preview / Green / Not green is a small segmented control.
- “Checked 2 min ago · 4:13 PM CT” is `whitespace-nowrap` and will clip on 360.
- Sentry lede link is fine; no drawer/dialog issues in the default state.

## Bugs

**Shots:** `bugs-phone.png`, `bugs-tablet-portrait.png`, `bugs-tablet-landscape.png`

- Crash card + grouped list stack cleanly. No page overflow.
- Header dummy stamp wraps and crowds Reset (same shell-header issue).
- List rows are tappable cards (good). Meta line uses `text-micro`.
- Opening a ticket swaps in Workplace `TicketView` (desktop ticket chrome).

## CRM / help desk

**Shots:** `crm-phone.png`, `crm-tablet-portrait.png`, `crm-tablet-landscape.png`

- Search button + `⌘K` hangs off the right; overflow ~93px.
- Section tabs fit; Triage badge is small.
- Overview 2×2 stat cards are OK; “Oldest untouched” titles truncate (`Apple Pe…`).
- Cases/contacts tables and case-detail `lg:grid-cols-[1fr_280px]` are later routes — same table/dialog problems once opened.
- Command palette is a desktop dialog.

## My Desk

**Shots:** `my-desk-phone.png`, `my-desk-tablet-portrait.png`, `my-desk-tablet-landscape.png`

- Do not change these files (parallel branch). Recorded only.
- Header overflow ~78px; Add is a small icon button.
- Today list is usable. Edit/Delete are visible (not hover-only) — better than Sales/Clinics.
- Two-card layout already stacks below `lg`.

## Community Development

**Shots:** `community-development-phone.png`, `community-development-tablet-portrait.png`, `community-development-tablet-landscape.png`

- Worst phone overflow (~106px). Seven-column table shows Name + a sliver of Type.
- Filter chip rows (type + status) wrap but stay <44px tall.
- Summary cards stack (`sm:grid-cols-3`) — fine.
- Same hover `⋯` row menu as Clinics.
- Add is a small header icon.

## 360×740 sanity

**Shots:** `home-phone-360.png`, `sales-phone-360.png`, `feature-request-phone-360.png`, `shell-phone-360.png`

Same failures as 390, tighter: more header clip, Feature Request columns become one-word stacks, Sales still clips the table inside the card.

## What the shell PR should fix (this branch only)

- Visible **menu button + slide-out drawer** on phone and tablet portrait (`max-width: 1023px`).
- Compact **app header** that fits (menu + current section). No new chrome at 1440.
- Keyboard: button exposes expand/collapse; Escape / overlay close; focus return; existing Cmd/Ctrl+B still works; drawer closes on navigate.
- **One** shared responsive table helper (scroll-inside-container, optional stack) for later screen PRs — do not restyle every table here.
- Leave My Desk files untouched. No live data.

## Screenshot index

| Screen | Phone | Tablet portrait | Tablet landscape | Extra |
|---|---|---|---|---|
| shell | `shell-phone.png` | `shell-tablet-portrait.png` | `shell-tablet-landscape.png` | `*-dark.png`, `shell-phone-360.png` |
| Home | `home-phone.png` | `home-tablet-portrait.png` | `home-tablet-landscape.png` | `home-phone-360.png` |
| Agent Workplace | `agent-workplace-phone.png` | `agent-workplace-tablet-portrait.png` | `agent-workplace-tablet-landscape.png` | |
| Metrics | `metrics-phone.png` | `metrics-tablet-portrait.png` | `metrics-tablet-landscape.png` | |
| Feature Request | `feature-request-phone.png` | `feature-request-tablet-portrait.png` | `feature-request-tablet-landscape.png` | `feature-request-phone-360.png` |
| Product Roadmap | `product-roadmap-phone.png` | `product-roadmap-tablet-portrait.png` | `product-roadmap-tablet-landscape.png` | |
| Clinics | `clinics-phone.png` | `clinics-tablet-portrait.png` | `clinics-tablet-landscape.png` | |
| Sales | `sales-phone.png` | `sales-tablet-portrait.png` | `sales-tablet-landscape.png` | `sales-phone-360.png` |
| System Status | `system-status-phone.png` | `system-status-tablet-portrait.png` | `system-status-tablet-landscape.png` | |
| Bugs | `bugs-phone.png` | `bugs-tablet-portrait.png` | `bugs-tablet-landscape.png` | |
| CRM | `crm-phone.png` | `crm-tablet-portrait.png` | `crm-tablet-landscape.png` | |
| My Desk | `my-desk-phone.png` | `my-desk-tablet-portrait.png` | `my-desk-tablet-landscape.png` | |
| Community Development | `community-development-phone.png` | `community-development-tablet-portrait.png` | `community-development-tablet-landscape.png` | |

Raw numbers: `measurements.json`.
