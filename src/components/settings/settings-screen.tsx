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

function SampleDataSection({ sampleData }: { sampleData: boolean }) {
  const stripe = useStripeFeed().kind === "live"
  const gmail = useGmailFeed().kind === "live"
  const live =
    stripe && gmail
      ? "Stripe's figures and the CRM's Gmail conversations are live"
      : stripe
        ? "Stripe's figures are live"
        : gmail
          ? "The CRM's Gmail conversations are live"
          : null
  return (
    <Section
      id="sample-data"
      title="Sample data"
      description={
        <>
          {live
            ? `${live} and carry no label; every other number is still sample data.`
            : "Nothing is connected yet, so every number on every screen is sample data."}{" "}
          Turning this off hides the amber {SAMPLE_DATA_LABEL} labels and notices only — the
          placeholder figures stay, and some screens (Agent Workplace, Product Roadmap, CRM rows) have
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
  { name: "PostHog", feeds: "Usage, active coaches, funnels" },
  { name: "Sentry", feeds: "Errors, crash-free rate, bugs" },
  { name: "Gmail", feeds: "Coach conversations for CRM" },
] as const

const STATUS_BADGE = "h-6 px-2.5"

/** Stripe's row: Connected (and when it last synced), Last updated (stale), or Not connected. */
function StripeStatus({ timeZone }: { timeZone: string }) {
  const feed = useStripeFeed()
  if (feed.kind === "loading") {
    return (
      <Badge variant="outline" aria-busy className={cn("text-muted-foreground!", STATUS_BADGE)}>
        Checking…
      </Badge>
    )
  }
  if (feed.kind === "sample") return <NotConnected />
  const when = formatWallClock(feed.lastSyncedAt, timeZone)
  if (feed.stale) {
    return (
      <Badge variant="outline" data-testid="stripe-status" className={STATUS_BADGE}>
        <AlertTriangleIcon aria-hidden className="text-danger-text" />
        {lastUpdatedLabel(feed.lastSyncedAt, timeZone)}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      data-testid="stripe-status"
      title={`Last synced ${when}`}
      className={cn("bg-success/10 text-success-text border-transparent", STATUS_BADGE)}
    >
      <CheckIcon aria-hidden />
      Connected
    </Badge>
  )
}

function StripeDetail({ timeZone }: { timeZone: string }) {
  const feed = useStripeFeed()
  if (feed.kind !== "live") return null
  return (
    <p className="text-caption text-muted-foreground" data-testid="stripe-detail">
      {feed.stale
        ? "Stripe could not be read just now, so its figures are the last good ones."
        : `Read-only · last synced ${formatWallClock(feed.lastSyncedAt, timeZone)}`}
    </p>
  )
}

/** Gmail's row: the same three states as Stripe's, for the CRM's support inbox. */
function GmailStatus({ timeZone }: { timeZone: string }) {
  const feed = useGmailFeed()
  if (feed.kind === "loading") {
    return (
      <Badge variant="outline" aria-busy className={cn("text-muted-foreground!", STATUS_BADGE)}>
        Checking…
      </Badge>
    )
  }
  if (feed.kind === "sample") return <NotConnected />
  if (feed.stale) {
    return (
      <Badge variant="outline" data-testid="gmail-status" className={STATUS_BADGE}>
        <AlertTriangleIcon aria-hidden className="text-danger-text" />
        {lastUpdatedLabel(feed.lastSyncedAt, timeZone)}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      data-testid="gmail-status"
      title={`Last synced ${formatWallClock(feed.lastSyncedAt, timeZone)}`}
      className={cn("bg-success/10 text-success-text border-transparent", STATUS_BADGE)}
    >
      <CheckIcon aria-hidden />
      Connected
    </Badge>
  )
}

function GmailDetail({ timeZone }: { timeZone: string }) {
  const feed = useGmailFeed()
  if (feed.kind !== "live") return null
  return (
    <p className="text-caption text-muted-foreground" data-testid="gmail-detail">
      {feed.stale
        ? "Gmail could not be read just now, so the CRM shows the last good threads."
        : `${feed.mailbox}, read-only · last synced ${formatWallClock(feed.lastSyncedAt, timeZone)}`}
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
      description="Where real numbers come from. Each connection needs a read-only key on the server; Stripe is the first."
    >
      <ul className="flex flex-col">
        {SOURCES.map((source, index) => (
          <li key={source.name} aria-label={source.name}>
            {index > 0 && <Separator />}
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0">
                <p className="text-body font-medium">{source.name}</p>
                <p className="text-caption text-muted-foreground">{source.feeds}</p>
                {source.name === "Stripe" && <StripeDetail timeZone={timeZone} />}
                {source.name === "Gmail" && <GmailDetail timeZone={timeZone} />}
              </div>
              {source.name === "Stripe" ? (
                <StripeStatus timeZone={timeZone} />
              ) : source.name === "Gmail" ? (
                <GmailStatus timeZone={timeZone} />
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
