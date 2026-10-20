export const UNLOCK_PATH = "/unlock"
export const LOGIN_PATH = "/api/gate/login"
export const LOGOUT_PATH = "/api/gate/logout"
/** Where the app lands after unlocking when there is no usable `next`. */
export const DEFAULT_NEXT = "/home"
/** Request header the proxy sets so the root layout renders /unlock without the app shell. */
export const BARE_HEADER = "x-hotdash-bare"
