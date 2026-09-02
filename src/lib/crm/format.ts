const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(date: Date | null | undefined, now = Date.now()) {
  if (!date) return "never"
  const diff = now - date.getTime()
  if (diff < MINUTE) return "just now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return formatDate(date, now)
}

/** "3d", "5h", "12m": how long something has been the case. */
export function formatDuration(ms: number) {
  if (ms < MINUTE) return "<1m"
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`
  if (ms < 30 * DAY) return `${Math.floor(ms / DAY)}d`
  return `${Math.floor(ms / (30 * DAY))}mo`
}

/** "Jun 3", or "Jun 3, 2025" once it is not this year. */
export function formatDate(date: Date, now = Date.now()) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  })
}

export function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function gmailMessageUrl(gmailMessageId: string) {
  return `https://mail.google.com/mail/u/0/#all/${gmailMessageId}`
}

export function gmailThreadUrl(gmailThreadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${gmailThreadId}`
}
