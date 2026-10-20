import { configureSubscriberLists } from "@/hooks/use-stripe-subscribers"
import type { StripeSubscriberList, SubscriberListKind, SubscriberListView } from "@/lib/stripe-subscribers"

export { CHURNED_ROWS, LIST_WINDOW, NEW_ROWS, subscriberList } from "@/test/stripe-fixture"

/** Start both lists on these answers (and keep answering them). */
export function setSubscriberListsForTest(lists: Partial<Record<SubscriberListKind, StripeSubscriberList>>) {
  const view = (list: SubscriberListKind): SubscriberListView =>
    lists[list] ? { phase: "ready", list: lists[list]! } : { phase: "loading" }
  configureSubscriberLists({
    initial: view,
    fetcher: async (list) => (lists[list] ? { kind: "ok", data: lists[list]! } : new Promise(() => {})),
  })
}

/** Both lists answered 401 by the login gate. */
export function setSubscriberListsUnauthorizedForTest() {
  configureSubscriberLists({ initial: { phase: "unauthorized" }, fetcher: async () => ({ kind: "unauthorized" }) })
}
