// How in-app feedback is told apart from email once it is stored. A
// feedback row has no Gmail ids, so both gmail columns carry this synthetic
// key instead; anything that would open Gmail checks here first.
// Dependency-free on purpose, so client components can import it.

export const FEEDBACK_THREAD_PREFIX = "feedback:"

export function feedbackKey(id: string) {
  return `${FEEDBACK_THREAD_PREFIX}${id}`
}

export function isFeedbackThread(threadId: string | null | undefined) {
  return Boolean(threadId?.startsWith(FEEDBACK_THREAD_PREFIX))
}
