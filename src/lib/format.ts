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
