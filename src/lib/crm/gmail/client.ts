import { gmail } from "@googleapis/gmail"
import { eq } from "drizzle-orm"
import { OAuth2Client, type Credentials } from "google-auth-library"

import { decryptSecret, encryptSecret } from "@/lib/crm/crypto"
import { resetGmailCursor } from "@/lib/crm/gmail/sync"
import { IntegrationError } from "@/lib/crm/core/errors"
import { logError } from "@/lib/crm/core/log"
import type { Db } from "@/lib/crm/db/client"
import { oauthTokens } from "@/lib/crm/db/schema"

import type { GmailApi, GmailRawMessage } from "./types"
import {
  GmailApiDisabledError,
  HistoryExpiredError,
  MessageNotFoundError,
  ReconnectRequiredError,
} from "./types"

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/crm/google/callback"
  if (!clientId || !clientSecret) {
    throw new IntegrationError(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set (see docs/SETUP.md)."
    )
  }
  return { clientId, clientSecret, redirectUri }
}

function appSecret(): string {
  const secret = process.env.APP_SECRET
  if (!secret) {
    throw new IntegrationError(
      "APP_SECRET must be set to store Google tokens securely."
    )
  }
  // HKDF-Extract is a single HMAC, so a short passphrase is brute-forceable
  // offline against a copied database.
  if (secret.length < 32) {
    throw new IntegrationError(
      "APP_SECRET is too short — use at least 32 characters (openssl rand -hex 32)."
    )
  }
  return secret
}

export function newOAuthClient(): OAuth2Client {
  const config = googleConfig()
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  })
}

export function authUrlFor(state: string): string {
  // prompt:consent forces Google to return a refresh_token on re-auth.
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    state,
  })
}

export function saveTokens(
  db: Db,
  tokens: Credentials,
  accountEmail?: string | null
) {
  const secret = appSecret()
  const existing = db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .get()
  const accessTokenEnc = tokens.access_token
    ? encryptSecret(tokens.access_token, secret)
    : (existing?.accessTokenEnc ?? null)
  const refreshTokenEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token, secret)
    : (existing?.refreshTokenEnc ?? null)
  const now = new Date()
  db.insert(oauthTokens)
    .values({
      provider: "google",
      accessTokenEnc,
      refreshTokenEnc,
      expiryDate: tokens.expiry_date ?? existing?.expiryDate ?? null,
      scope: tokens.scope ?? existing?.scope ?? GMAIL_SCOPE,
      accountEmail: accountEmail ?? existing?.accountEmail ?? null,
      errorMessage: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: {
        accessTokenEnc,
        refreshTokenEnc,
        expiryDate: tokens.expiry_date ?? existing?.expiryDate ?? null,
        scope: tokens.scope ?? existing?.scope ?? GMAIL_SCOPE,
        accountEmail: accountEmail ?? existing?.accountEmail ?? null,
        errorMessage: null,
        updatedAt: now,
      },
    })
    .run()
}

export function getGoogleConnection(db: Db) {
  const row = db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .get()
  if (!row) return { connected: false as const }
  return {
    connected: true as const,
    accountEmail: row.accountEmail,
    errorMessage: row.errorMessage,
    updatedAt: row.updatedAt,
  }
}

export async function disconnectGoogle(db: Db) {
  const row = db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .get()

  // Best-effort revoke first: deleting the row alone leaves the refresh
  // token valid at Google indefinitely, so a token leaked from a database
  // copy would survive a "Disconnect".
  if (row?.refreshTokenEnc) {
    try {
      const refreshToken = decryptSecret(row.refreshTokenEnc, appSecret())
      await newOAuthClient().revokeToken(refreshToken)
    } catch (error) {
      logError("google-revoke", error)
    }
  }

  db.delete(oauthTokens).where(eq(oauthTokens.provider, "google")).run()
  // The history cursor belongs to the mailbox we just let go of. Reconnecting
  // a different account with it still in place would resume from a stranger's
  // history id.
  resetGmailCursor(db)
}

export async function handleOAuthCallback(db: Db, code: string) {
  const client = newOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)
  const api = gmail({ version: "v1", auth: client })
  // Past this point the sign-in succeeded; a failure here is Gmail's, not the
  // credentials', and the caller reports it differently.
  let profile
  try {
    profile = await api.users.getProfile({ userId: "me" })
  } catch (error) {
    if (isApiDisabled(error)) throw new GmailApiDisabledError()
    throw error
  }
  saveTokens(db, tokens, profile.data.emailAddress ?? null)
  return { accountEmail: profile.data.emailAddress ?? null }
}

/**
 * Google signals a disabled API as a 403 whose reason is `accessNotConfigured`
 * (older responses only carry the prose). A 403 from an *enabled* API means
 * insufficient scope, which is a different fix, so match on the reason rather
 * than the status alone.
 */
export function isApiDisabled(error: unknown): boolean {
  const err = error as {
    message?: string
    errors?: { reason?: string }[]
    response?: { data?: { error?: { errors?: { reason?: string }[] } } }
  }
  const reasons = [
    ...(err?.errors ?? []),
    ...(err?.response?.data?.error?.errors ?? []),
  ].map((e) => e.reason)
  if (reasons.includes("accessNotConfigured")) return true
  return /has not been used in project|it is disabled/i.test(err?.message ?? "")
}

function markReconnectRequired(db: Db, message: string) {
  db.update(oauthTokens)
    .set({ errorMessage: message, updatedAt: new Date() })
    .where(eq(oauthTokens.provider, "google"))
    .run()
}

function isInvalidGrant(error: unknown): boolean {
  const err = error as {
    message?: string
    response?: { data?: { error?: string } }
  }
  return (
    err?.response?.data?.error === "invalid_grant" ||
    /invalid_grant/i.test(err?.message ?? "")
  )
}

function statusOf(error: unknown): number | undefined {
  const err = error as { status?: number; response?: { status?: number } }
  return err?.response?.status ?? err?.status
}

function reasonsOf(error: unknown): string[] {
  const err = error as {
    errors?: { reason?: string }[]
    response?: { data?: { error?: { errors?: { reason?: string }[] } } }
  }
  return [
    ...(err?.errors ?? []),
    ...(err?.response?.data?.error?.errors ?? []),
  ].flatMap((e) => (e.reason ? [e.reason] : []))
}

const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
])

/**
 * Gmail reports throttling as a 429, or as a 403 whose reason names a rate
 * limit — the same status a disabled API and a missing scope use, so the
 * reason has to be read rather than the status alone.
 */
export function isRateLimited(error: unknown): boolean {
  if (statusOf(error) === 429) return true
  if (statusOf(error) !== 403) return false
  if (reasonsOf(error).some((reason) => RATE_LIMIT_REASONS.has(reason))) {
    return true
  }
  const message = (error as { message?: string })?.message ?? ""
  return /quota exceeded|rate limit/i.test(message)
}

/** Seconds Google asked us to wait, when it says so. */
function retryAfterMs(error: unknown): number | null {
  const headers = (error as { response?: { headers?: Record<string, string> } })
    ?.response?.headers
  const value = headers?.["retry-after"]
  if (!value) return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
}

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 40_000]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createGmailApi(
  db: Db
): Promise<{ api: GmailApi; accountEmail: string }> {
  const secret = appSecret()
  const row = db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .get()
  if (!row?.refreshTokenEnc) {
    throw new IntegrationError(
      "Google is not connected. Connect it from Settings."
    )
  }

  const credentials: Credentials = {
    refresh_token: decryptSecret(row.refreshTokenEnc, secret),
    access_token: row.accessTokenEnc
      ? decryptSecret(row.accessTokenEnc, secret)
      : undefined,
    expiry_date: row.expiryDate ?? undefined,
  }

  const client = newOAuthClient()
  client.setCredentials(credentials)
  client.on("tokens", (tokens) => {
    try {
      saveTokens(db, tokens)
    } catch (error) {
      // The run still works, but a rotated APP_SECRET shows up here first
      // and would otherwise fail silently on every refresh.
      logError("google-token-persist", error)
    }
  })

  const raw = gmail({ version: "v1", auth: client, retry: true } as never)

  // Gmail's per-user quota is a moving window, so a backfill large enough to
  // hit it only needs to wait — but gaxios' own three quick retries are not
  // patient enough for one, and the failure then killed the whole run. Back
  // off far enough to outlast the window.
  const translate = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (isInvalidGrant(error)) {
          markReconnectRequired(
            db,
            "Google authorization expired — reconnect from Settings."
          )
          throw new ReconnectRequiredError()
        }
        const delay = RETRY_DELAYS_MS[attempt]
        if (!isRateLimited(error) || delay === undefined) throw error
        // Jitter keeps concurrent workers from retrying in lockstep.
        await sleep(retryAfterMs(error) ?? delay + Math.random() * 500)
      }
    }
  }

  const api: GmailApi = {
    async getProfile() {
      const res = await translate(() => raw.users.getProfile({ userId: "me" }))
      return {
        emailAddress: res.data.emailAddress ?? "",
        historyId: String(res.data.historyId ?? ""),
      }
    },
    async listMessageIds({ q, pageToken }) {
      const res = await translate(() =>
        raw.users.messages.list({ userId: "me", q, maxResults: 100, pageToken })
      )
      return {
        ids: (res.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id)),
        nextPageToken: res.data.nextPageToken ?? undefined,
      }
    },
    async getMessage(id) {
      try {
        const res = await translate(() =>
          raw.users.messages.get({ userId: "me", id, format: "full" })
        )
        return res.data as GmailRawMessage
      } catch (error) {
        if (statusOf(error) === 404) throw new MessageNotFoundError(id)
        throw error
      }
    },
    async listHistory({ startHistoryId, pageToken }) {
      try {
        const res = await translate(() =>
          raw.users.history.list({
            userId: "me",
            startHistoryId,
            historyTypes: ["messageAdded"],
            maxResults: 100,
            pageToken,
          })
        )
        const messageIds: string[] = []
        for (const entry of res.data.history ?? []) {
          for (const added of entry.messagesAdded ?? []) {
            if (added.message?.id) messageIds.push(added.message.id)
          }
        }
        return {
          historyId: res.data.historyId ? String(res.data.historyId) : null,
          messageIds,
          nextPageToken: res.data.nextPageToken ?? undefined,
        }
      } catch (error) {
        if (statusOf(error) === 404) throw new HistoryExpiredError()
        throw error
      }
    },
    async getThread(threadId) {
      const res = await translate(() =>
        raw.users.threads.get({ userId: "me", id: threadId, format: "full" })
      )
      return {
        messages: (res.data.messages ?? []) as GmailRawMessage[],
      }
    },
  }

  return { api, accountEmail: row.accountEmail ?? "" }
}

export function founderAliasesFromEnv(): string[] {
  return (process.env.FOUNDER_ALIASES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
}
