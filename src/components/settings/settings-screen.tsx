"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FlaskConicalIcon,
  HardDriveIcon,
  AlertTriangleIcon,
  CheckIcon,
  MonitorIcon,
  MoonIcon,
  RotateCcwIcon,
  SunIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import { TIME_ZONES, formatWallClock, isTimeZoneId, timeZoneOption } from "@/lib/clock"
import { lastUpdatedLabel } from "@/lib/live-metrics"
import {
  APPEARANCE_OPTIONS,
  GOAL_FIELDS,
  canHide,
  checkGoals,
  defaultSidebar,
  formatGoal,
  goalDraft,
  isAppearance,
  isDefaultSidebar,
  moveScreen,
  setScreenHidden,
  sidebarRows,
  type Appearance,
  type GoalDraft,
  type GoalField,
} from "@/lib/settings"
import { cn } from "@/lib/utils"
import { updateSettings, useSettingsSnapshot } from "@/hooks/use-settings"
import { useGmailFeed } from "@/hooks/use-gmail-summary"
import { useMounted } from "@/hooks/use-mounted"
import { useNotionRoadmapFeed } from "@/hooks/use-notion-roadmap"
import { usePosthogFeed } from "@/hooks/use-posthog-summary"
import { useStripeFeed } from "@/hooks/use-stripe-summary"
import { useWallClock } from "@/hooks/use-wall-clock"
import { PERSISTENCE_COPY } from "@/components/persistence-note"
import { SAMPLE_DATA_LABEL, SAMPLE_SURFACE } from "@/components/sample-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** Below `xl` (1280) every control is at least 44px tall. */
const TOUCH = "max-xl:h-11!"
const TOUCH_ICON = "size-8 max-xl:size-11!"

/** Selected segment reads lighter than the track, as in the sidebar toggle. */
const PRESSED = "aria-pressed:bg-background! dark:aria-pressed:bg-accent! aria-pressed:shadow-sm"

export const SETTINGS_NOTE_NAME = "Where settings live"

const APPEARANCE_ICONS: Record<Appearance, React.ComponentType> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
}

/** A card with its heading as the region's name, so tests and AT can scope to it. */
function Section({
  id,
  title,
  description,
  children,
  action,
}: {
  id: string
  title: string
  description: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const headingId = `settings-${id}`
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <Card className="min-w-0">
        <CardHeader className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <CardTitle>
              <h2 id={headingId} className="text-title-sm font-semibold tracking-tight">
                {title}
              </h2>
            </CardTitle>
            <CardDescription className="text-label mt-1">{description}</CardDescription>
          </div>
          {action}
        </CardHeader>
        <CardContent className="min-w-0">{children}</CardContent>
      </Card>
    </section>
  )
}

/* ------------------------------------------------------------ appearance */

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  // next-themes knows the stored choice only in the browser.
  const value = mounted && isAppearance(theme) ? [theme] : []

  return (
    <Section
      id="appearance"
      title="Appearance"
      description="Light, dark, or follow your device. Same switch as the sidebar's."
    >
      <ToggleGroup
        aria-label="Appearance mode"
        variant="outline"
        spacing={0}
        className="bg-muted grid w-full grid-cols-3 sm:w-auto sm:min-w-[360px]"
        value={value}
        onValueChange={(next) => {
          // Single-select: ignore the empty array from re-clicking the pressed item.
          if (isAppearance(next[0])) setTheme(next[0])
        }}
      >
        {APPEARANCE_OPTIONS.map((option) => {
          const Icon = APPEARANCE_ICONS[option.value]
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              // Icons drop on phones so "Match device" never clips at 390.
              className={cn("h-9 min-w-0 px-2 max-sm:[&_svg]:hidden", TOUCH, PRESSED)}
            >
              <Icon />
              {option.label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </Section>
  )
}

/* ------------------------------------------------------------- time zone */

function TimeZoneSection({ timeZone }: { timeZone: string }) {
  const option = timeZoneOption(timeZone)
  const clock = useWallClock(option.id)
  const labelId = "settings-time-zone-label"

  return (
    <Section
      id="time-zone"
      title="Time zone"
      description="Central by default. Home's clock and weekday follow this choice, and so do Stripe's “today” and “this week” (from Monday 00:00). Sample figures are still dated in Central."
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span id={labelId} className="sr-only">
          Time zone
        </span>
        <Select
          value={option.id}
          onValueChange={(value) => {
            if (isTimeZoneId(value)) updateSettings((s) => (s.timeZone === value ? s : { ...s, timeZone: value }))
          }}
          items={TIME_ZONES.map((z) => ({ value: z.id, label: z.label }))}
        >
          <SelectTrigger aria-labelledby={labelId} className={cn("w-full sm:w-56", TOUCH)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_ZONES.map((zone) => (
              <SelectItem key={zone.id} value={zone.id} className="max-xl:min-h-11">
                {zone.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-label text-muted-foreground tabular-nums" data-testid="settings-clock">
          {clock ? <>Now: {clock}</> : <>&nbsp;</>}
        </p>
      </div>
    </Section>
  )
}

/* ----------------------------------------------------------------- goals */

const GOAL_COPY: Record<GoalField, { label: string; hint: string; prefix?: string; suffix?: string }> = {
  monthlyRevenue: { label: "Monthly revenue goal", hint: "Whole dollars a month.", prefix: "$" },
  trialToPaid: { label: "Trial-to-paid target", hint: "Percent of trials that convert, 0–100.", suffix: "%" },
  churnLimit: { label: "Churn limit", hint: "Highest monthly churn you'll accept, 0–100.", suffix: "%" },
}

function GoalsSection({ goals }: { goals: Parameters<typeof goalDraft>[0] }) {
  const stored = React.useMemo(() => goalDraft(goals), [goals])
  const [draft, setDraft] = React.useState<GoalDraft>(stored)
  const [errors, setErrors] = React.useState<Partial<Record<GoalField, string>>>({})
  const [message, setMessage] = React.useState("")
  // Another tab (or the first read of this browser's copy) changed the
  // stored goals: show them, unless the founder is mid-edit.
  const [lastStored, setLastStored] = React.useState(stored)
  if (lastStored !== stored) {
    setLastStored(stored)
    const dirty = GOAL_FIELDS.some((f) => draft[f] !== lastStored[f])
    if (!dirty) setDraft(stored)
  }
  const ids = React.useId()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = checkGoals(draft)
    if (!result.ok) {
      setErrors(result.errors)
      setMessage("")
      return
    }
    setErrors({})
    updateSettings((s) => ({ ...s, goals: result.goals }))
    setDraft(goalDraft(result.goals))
    setMessage("Goals saved.")
  }

  return (
    <Section
      id="goals"
      title="Goals and targets"
      description="Home and Metrics will show on track or behind against these once Stripe is connected. Leave a field blank for not set."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          {GOAL_FIELDS.map((field) => {
            const copy = GOAL_COPY[field]
            const inputId = `${ids}-${field}`
            const hintId = `${inputId}-hint`
            const errorId = `${inputId}-error`
            const error = errors[field]
            return (
              <div key={field} className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={inputId} className="text-label font-medium">
                  {copy.label}
                </label>
                <div className="relative">
                  {copy.prefix && (
                    <span aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
                      {copy.prefix}
                    </span>
                  )}
                  <Input
                    id={inputId}
                    name={field}
                    inputMode={field === "monthlyRevenue" ? "numeric" : "decimal"}
                    autoComplete="off"
                    placeholder="Not set"
                    value={draft[field]}
                    onChange={(e) => {
                      const value = e.target.value
                      setDraft((d) => ({ ...d, [field]: value }))
                      setMessage("")
                      if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }))
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${errorId} ${hintId}` : hintId}
                    className={cn("h-9", TOUCH, copy.prefix && "pl-6!", copy.suffix && "pr-7!")}
                  />
                  {copy.suffix && (
                    <span aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm">
                      {copy.suffix}
                    </span>
                  )}
                </div>
                {error && (
                  <p id={errorId} className="text-caption text-danger-text font-medium">
                    {error}
                  </p>
                )}
                <p id={hintId} className="text-caption text-muted-foreground">
                  {copy.hint} Saved: {formatGoal(field, goals[field])}
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className={cn("h-9", TOUCH)}>
            Save goals
          </Button>
          <p role="status" className="text-label text-muted-foreground">
            {message}
          </p>
        </div>
      </form>
    </Section>
  )
}

/* ----------------------------------------------------------- sample data */

/**
 * A switch with a full-row label, so the touch target is the row (≥44px
 * below `xl`) rather than the 18px track.
 */
function SwitchRow({
  checked,
  onCheckedChange,
  label,
  className,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <label
      data-slot="switch-row"
      className={cn(
        "hover:bg-muted/60 flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 max-xl:min-h-11",
        className
      )}
    >
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      {children}
    </label>
  )
}

/**
 * The Sample data section's first sentence: what is live, what is
 * connecting, and that the rest is sample. Notion feeds the Product Roadmap
 * (bets, not numbers), so it gets its own sentence after the figures'.
 */
export function sampleDataSummary({
  notion = false,
  notionConnecting = false,
  ...figures
}: {
  stripe: boolean
  posthog: boolean
  /** The CRM's Gmail conversations are live (#46). */
  gmail?: boolean
  stripeConnecting: boolean
  appStoreConnecting: boolean
  notion?: boolean
  notionConnecting?: boolean
}): string {
  // Nothing besides Notion is live or connecting. (App Store connecting
  // implies Stripe live, so `stripe` already covers it.)
  const nothingElse = !figures.stripe && !figures.posthog && !figures.gmail && !figures.stripeConnecting
  // With Notion live or connecting, the Roadmap is not sample, so the
  // sample sentence names only the other screens (as #50 does for Stripe
  // connecting: "Every other number is still sample data").
  if (notion) {
    return nothingElse
      ? "The Product Roadmap is read from Notion; every number on the other screens is still sample data."
      : `${figuresSummary(figures)} The Product Roadmap is read from Notion.`
  }
  if (notionConnecting) {
    const roadmap = "Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then."
    return nothingElse
      ? `${roadmap} Every number on the other screens is still sample data.`
      : `${figuresSummary(figures)} ${roadmap}`
  }
  return figuresSummary(figures)
}

function figuresSummary({
  stripe,
  posthog,
  gmail = false,
  stripeConnecting,
  appStoreConnecting,
}: {
  stripe: boolean
  posthog: boolean
  /** The CRM's Gmail conversations are live. */
  gmail?: boolean
  stripeConnecting: boolean
  appStoreConnecting: boolean
}): string {
  const figures = stripe ? (posthog ? "Stripe's and PostHog's" : "Stripe's") : posthog ? "PostHog's" : null
  const live =
    figures && gmail
      ? `${figures} figures and the CRM's Gmail conversations are`
      : figures
        ? `${figures} figures are`
        : gmail
          ? "The CRM's Gmail conversations are"
          : null
  if (!live && !stripeConnecting) return "Nothing is connected yet, so every number on every screen is sample data."
  if (!live) return "Stripe is connecting (first sync in progress); its figures show a placeholder until then. Every other number is still sample data."
  const connecting = stripeConnecting
    ? " Stripe is connecting (first sync in progress)."
    : appStoreConnecting
      ? " App Store payers from Chlk\u2019s database are connecting, first read in progress."
      : ""
  if (!connecting) return `${live} live and carry no label; every other number is still sample data.`
  return `${live} live and carry no label;${connecting} Every other number is still sample data.`
}

function SampleDataSection({ sampleData }: { sampleData: boolean }) {
  const stripeFeed = useStripeFeed()
  const notionFeed = useNotionRoadmapFeed()
  const summary = sampleDataSummary({
    stripe: stripeFeed.kind === "live",
    posthog: usePosthogFeed().kind === "live",
    gmail: useGmailFeed().kind === "live",
    stripeConnecting: stripeFeed.kind === "loading" && Boolean(stripeFeed.connecting),
    appStoreConnecting: stripeFeed.kind === "live" && stripeFeed.appStore.status === "connecting",
    notion: notionFeed.kind === "live",
    notionConnecting: notionFeed.kind === "loading" && Boolean(notionFeed.connecting),
  })
  return (
    <Section
      id="sample-data"
      title="Sample data"
      description={
        <>
          {summary}{" "}
          Turning this off hides the amber {SAMPLE_DATA_LABEL} labels and notices only — the
          placeholder figures stay, and some screens (Agent Workplace, CRM rows) have
          no label to hide.
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SwitchRow
          label="Show Sample data labels"
          checked={sampleData}
          onCheckedChange={(checked) =>
            updateSettings((s) => (s.sampleData === checked ? s : { ...s, sampleData: checked }))
          }
          className="-mx-2 self-start"
        >
          <span className="text-body font-medium">Show {SAMPLE_DATA_LABEL} labels</span>
        </SwitchRow>
        <p className="text-caption flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Labels look like</span>
          <span
            className={cn(
              "text-micro inline-flex h-5 items-center gap-1 rounded-full border px-1.5 font-semibold tracking-tight",
              SAMPLE_SURFACE
            )}
          >
            <FlaskConicalIcon className="size-3" aria-hidden />
            {SAMPLE_DATA_LABEL}
          </span>
          <span className="text-muted-foreground">{sampleData ? "and are shown." : "and are hidden."}</span>
        </p>
      </div>
    </Section>
  )
}

/* -------------------------------------------------------- connected data */

const SOURCES = [
  { name: "Stripe", feeds: "Subscribers, revenue, churn, trials" },
  { name: "PostHog", feeds: "Active users and retention (iOS app)" },
  { name: "Sentry", feeds: "Errors, crash-free rate, bugs" },
  { name: "Gmail", feeds: "Coach conversations for CRM" },
  { name: "Notion", feeds: "Product Roadmap" },
] as const

const STATUS_BADGE = "h-6 px-2.5"

/**
 * What a live source's row needs: Stripe's, PostHog's, Gmail's and Notion's
 * feeds all fit (Notion says `not_connected` where the others still say
 * `sample`; both read Not connected here).
 */
type SourceFeed =
  | { kind: "loading"; connecting?: boolean }
  | { kind: "sample" }
  | { kind: "not_connected" }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; mailbox?: string }

type LiveFeed = {
  use: () => SourceFeed
  id: string
  /** The detail line while a first sync runs. */
  connecting: string
  /** The detail line when the source could not be read and the last good copy shows. */
  stale: string
  /** What the "read-only · last synced" line leads with; "Read-only" by default. */
  readOnly?: (feed: Extract<SourceFeed, { kind: "live" }>) => string
}

/** Hooks per live source, so each row reads only its own. */
const LIVE_FEEDS: Partial<Record<(typeof SOURCES)[number]["name"], LiveFeed>> = {
  Stripe: {
    use: useStripeFeed,
    id: "stripe",
    connecting: "Read-only key found · first sync in progress, figures appear when it finishes",
    stale: "Stripe could not be read just now, so its figures are the last good ones.",
  },
  PostHog: {
    use: usePosthogFeed,
    id: "posthog",
    connecting: "Read-only key found · first sync in progress, figures appear when it finishes",
    stale: "PostHog could not be read just now, so its figures are the last good ones.",
  },
  Gmail: {
    use: useGmailFeed,
    id: "gmail",
    connecting: "Read-only access found · first sync in progress, the CRM's conversations appear when it finishes",
    stale: "Gmail could not be read just now, so the CRM shows the last good threads.",
    // Names the mailbox, as #46's row did: "info@chlkapp.com, read-only · …".
    readOnly: (feed) => (feed.mailbox ? `${feed.mailbox}, read-only` : "Read-only"),
  },
  Notion: {
    use: useNotionRoadmapFeed,
    id: "notion",
    connecting: "Read-only token found · first sync in progress, the Roadmap appears when it finishes",
    stale: "Notion could not be read just now, so the Roadmap shows the last good copy.",
  },
}

/**
 * A live source's row: Connected (and when it last synced), Last updated
 * (stale), Connecting… (a key is set, its first sync is still running), or
 * Not connected (no key).
 */
function SourceStatus({ name, timeZone }: { name: keyof typeof LIVE_FEEDS; timeZone: string }) {
  const { use, id } = LIVE_FEEDS[name]!
  const feed = use()
  if (feed.kind === "loading" && feed.connecting) {
    return (
      <Badge variant="outline" aria-busy data-testid={`${id}-status`} className={cn("text-muted-foreground!", STATUS_BADGE)}>
        Connecting…
      </Badge>
    )
  }
  if (feed.kind === "loading") {
    return (
      <Badge variant="outline" aria-busy className={cn("text-muted-foreground!", STATUS_BADGE)}>
        Checking…
      </Badge>
    )
  }
  if (feed.kind === "sample" || feed.kind === "not_connected") return <NotConnected />
  const when = formatWallClock(feed.lastSyncedAt, timeZone)
  if (feed.stale) {
    return (
      <Badge variant="outline" data-testid={`${id}-status`} className={STATUS_BADGE}>
        <AlertTriangleIcon aria-hidden className="text-danger-text" />
        {lastUpdatedLabel(feed.lastSyncedAt, timeZone)}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      data-testid={`${id}-status`}
      title={`Last synced ${when}`}
      className={cn("bg-success/10 text-success-text border-transparent", STATUS_BADGE)}
    >
      <CheckIcon aria-hidden />
      Connected
    </Badge>
  )
}

function SourceDetail({ name, timeZone }: { name: keyof typeof LIVE_FEEDS; timeZone: string }) {
  const { use, id, connecting, stale, readOnly } = LIVE_FEEDS[name]!
  const feed = use()
  if (feed.kind === "loading" && feed.connecting) {
    return (
      <p className="text-caption text-muted-foreground" data-testid={`${id}-detail`}>
        {connecting}
      </p>
    )
  }
  if (feed.kind !== "live") return null
  return (
    <p className="text-caption text-muted-foreground" data-testid={`${id}-detail`}>
      {feed.stale
        ? stale
        : `${readOnly ? readOnly(feed) : "Read-only"} · last synced ${formatWallClock(feed.lastSyncedAt, timeZone)}`}
    </p>
  )
}

function NotConnected() {
  return (
    <Badge variant="outline" className={cn("text-muted-foreground!", STATUS_BADGE)}>
      Not connected
    </Badge>
  )
}

function ConnectedDataSection({ timeZone }: { timeZone: string }) {
  return (
    <Section
      id="connected-data"
      title="Connected data"
      description="Where real numbers come from. Each connection needs a read-only key on the server; Stripe, PostHog, Gmail and Notion are wired up so far."
    >
      <ul className="flex flex-col">
        {SOURCES.map((source, index) => (
          <li key={source.name} aria-label={source.name}>
            {index > 0 && <Separator />}
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0">
                <p className="text-body font-medium">{source.name}</p>
                <p className="text-caption text-muted-foreground">{source.feeds}</p>
                {LIVE_FEEDS[source.name] && <SourceDetail name={source.name} timeZone={timeZone} />}
              </div>
              {LIVE_FEEDS[source.name] ? (
                <SourceStatus name={source.name} timeZone={timeZone} />
              ) : (
                <NotConnected />
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* --------------------------------------------------------------- sidebar */

function SidebarSection({ prefs }: { prefs: Parameters<typeof sidebarRows>[0] }) {
  const rows = sidebarRows(prefs)
  const atDefault = isDefaultSidebar(prefs)

  return (
    <Section
      id="sidebar"
      title="Sidebar"
      description="Show, hide and reorder screens. Home is always shown, and Settings stays in the sidebar footer. A hidden screen still opens from its link."
      action={
        <Button
          variant="outline"
          className={cn("h-8", TOUCH)}
          onClick={() =>
            updateSettings((s) => (atDefault ? s : { ...s, sidebar: defaultSidebar() }))
          }
        >
          <RotateCcwIcon aria-hidden />
          Reset to default
        </Button>
      }
    >
      <ol aria-label="Sidebar screens" className="flex flex-col">
        {rows.map(({ item, hidden }, index) => (
          <li
            key={item.href}
            aria-label={item.label}
            data-hidden={hidden || undefined}
            className="border-border flex min-w-0 items-center gap-2 border-t py-1.5 first:border-t-0"
          >
            <item.icon aria-hidden className="text-muted-foreground size-4 flex-none" />
            <span className="min-w-0 flex-1">
              <span className={cn("text-body block font-medium break-words", hidden && "text-muted-foreground line-through")}>
                {item.label}
              </span>
              {hidden && <span className="text-caption text-muted-foreground block">Hidden</span>}
            </span>
            {canHide(item.href) ? (
              <SwitchRow
                label={`Show ${item.label}`}
                checked={!hidden}
                onCheckedChange={(checked) =>
                  updateSettings((s) => ({ ...s, sidebar: setScreenHidden(s.sidebar, item.href, !checked) }))
                }
                className="flex-none px-2"
              />
            ) : (
              <span className="text-caption text-muted-foreground flex-none px-2">Always shown</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={TOUCH_ICON}
              aria-label={`Move ${item.label} up`}
              disabled={index === 0}
              onClick={() => updateSettings((s) => ({ ...s, sidebar: moveScreen(s.sidebar, item.href, -1) }))}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={TOUCH_ICON}
              aria-label={`Move ${item.label} down`}
              disabled={index === rows.length - 1}
              onClick={() => updateSettings((s) => ({ ...s, sidebar: moveScreen(s.sidebar, item.href, 1) }))}
            >
              <ArrowDownIcon aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ---------------------------------------------------------------- screen */

function SettingsNote({ saved, saveFailed }: { saved: boolean; saveFailed: boolean }) {
  const mounted = useMounted()
  const copy = !mounted
    ? PERSISTENCE_COPY.loading.replace("edits", "settings")
    : saveFailed
      ? PERSISTENCE_COPY.failed
      : saved
        ? PERSISTENCE_COPY.saved
        : "Settings save in this browser"
  return (
    <span
      className={cn(
        "text-micro inline-flex items-center gap-1.5",
        saveFailed ? "text-danger-text" : "text-muted-foreground"
      )}
    >
      {saveFailed ? (
        <AlertTriangleIcon className="size-3.5" aria-hidden />
      ) : (
        <HardDriveIcon className="size-3.5" aria-hidden />
      )}
      <span role={saveFailed ? "alert" : "status"} aria-label={SETTINGS_NOTE_NAME}>
        {copy}
      </span>
    </span>
  )
}

export function SettingsScreen() {
  const { settings, saved, saveFailed } = useSettingsSnapshot()

  return (
    <div data-slot="settings-screen" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-display-sm font-semibold tracking-tight">Settings</h1>
          <p className="text-label text-muted-foreground mt-[5px] tracking-tight">
            Preferences for this dashboard · kept in this browser only
          </p>
        </div>
        <SettingsNote saved={saved} saveFailed={saveFailed} />
      </header>

      <div className="flex max-w-[920px] min-w-0 flex-col gap-4">
        <AppearanceSection />
        <TimeZoneSection timeZone={settings.timeZone} />
        <GoalsSection goals={settings.goals} />
        <SampleDataSection sampleData={settings.sampleData} />
        <ConnectedDataSection timeZone={settings.timeZone} />
        <SidebarSection prefs={settings.sidebar} />
      </div>
    </div>
  )
}
