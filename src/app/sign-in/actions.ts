"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { getAuthConfig } from "@/lib/auth/config"
import { signInLimiter } from "@/lib/auth/rate-limit"
import { safeNext } from "@/lib/auth/safe-next"
import { clientIp } from "@/lib/auth/server"
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session"
import { AUTH_COPY } from "@/lib/auth/messages"
import { attemptSignIn } from "@/lib/auth/sign-in"

export type SignInState = { error: string | null; email: string }

/** Verifies the password on the server (Node runtime) and sets the session cookie. */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "")
  const password = String(form.get("password") ?? "")
  const config = getAuthConfig()
  if (!config) return { error: AUTH_COPY.notConfigured, email }

  const result = await attemptSignIn({
    email,
    password,
    ip: clientIp(await headers()),
    config,
    limiter: signInLimiter,
  })
  if (!result.ok) return { error: result.error, email }

  const token = await signSession(result.email, config.secret)
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions())
  redirect(safeNext(form.get("next")))
}
