import { gmail } from "@googleapis/gmail"
import { eq } from "drizzle-orm"
import { OAuth2Client, type Credentials } from "google-auth-library"

import { decryptSecret, encryptSecret } from "@/lib/crm/auth/crypto"
import { IntegrationError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import { oauthTokens } from "@/lib/crm/db/schema"

import type { GmailApi, GmailRawMessage } from "./types"
import { HistoryExpiredError, ReconnectRequiredError } from "./types"

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

export function googleConfig() {
  const clientId =
    process.env.CRM_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GMAIL_CLIENT_ID?.trim()
  const clientSecret =
    process.env.CRM_GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.GMAIL_CLIENT_SECRET?.trim()
  const redirectUri =
    process.env.CRM_GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/crm/google/callback"
  if (!clientId || !clientSecret) {
    throw new IntegrationError(
      "Gmail OAuth client credentials are not configured (see docs/gmail-setup.md)."
    )
  }
  return { clientId, clientSecret, redirectUri }
}

function appSecret(): string {
  const secret = process.env.CRM_TOKEN_SECRET
  if (!secret) {
    throw new IntegrationError(
      "CRM_TOKEN_SECRET must be set to store Google tokens securely."
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

export async function saveTokens(
  db: Db,
  tokens: Credentials,
  accountEmail?: string | null
) {
  const secret = appSecret()
  const [existing] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .limit(1)
  const accessTokenEnc = tokens.access_token
    ? encryptSecret(tokens.access_token, secret)
    : (existing?.accessTokenEnc ?? null)
  const refreshTokenEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token, secret)
    : (existing?.refreshTokenEnc ?? null)
  const now = new Date()
  await db.insert(oauthTokens)
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
}

export async function getGoogleConnection(db: Db) {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .limit(1)
  if (!row) return { connected: false as const }
  return {
    connected: true as const,
    accountEmail: row.accountEmail,
    errorMessage: row.errorMessage,
    updatedAt: row.updatedAt,
  }
}

export async function disconnectGoogle(db: Db) {
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, "google"))
}

export async function handleOAuthCallback(db: Db, code: string) {
  const client = newOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)
  const api = gmail({ version: "v1", auth: client })
  const profile = await api.users.getProfile({ userId: "me" })
  await saveTokens(db, tokens, profile.data.emailAddress ?? null)
  return { accountEmail: profile.data.emailAddress ?? null }
}

async function markReconnectRequired(db: Db, message: string) {
  await db.update(oauthTokens)
    .set({ errorMessage: message, updatedAt: new Date() })
    .where(eq(oauthTokens.provider, "google"))
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

export async function createGmailApi(
  db: Db
): Promise<{ api: GmailApi; accountEmail: string }> {
  const secret = appSecret()
  let [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .limit(1)
  const environmentRefreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim()
  if (!row?.refreshTokenEnc && environmentRefreshToken) {
    await saveTokens(
      db,
      { refresh_token: environmentRefreshToken },
      process.env.GMAIL_MAILBOX?.trim().toLowerCase() || null
    )
    const [importedRow] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.provider, "google"))
      .limit(1)
    row = importedRow
  }
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
    void saveTokens(db, tokens).catch(() => {
      // Persisting refreshed tokens is best-effort; the run still works.
    })
  })

  const raw = gmail({ version: "v1", auth: client, retry: true } as never)

  const translate = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      if (isInvalidGrant(error)) {
        await markReconnectRequired(
          db,
          "Google authorization expired — reconnect from Settings."
        )
        throw new ReconnectRequiredError()
      }
      throw error
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
      const res = await translate(() =>
        raw.users.messages.get({ userId: "me", id, format: "full" })
      )
      return res.data as GmailRawMessage
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
  return (process.env.CRM_FOUNDER_ALIASES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
}
