#!/usr/bin/env node
/**
 * One-time Gmail consent for the CRM: turns a Google "Desktop app" OAuth
 * client into the refresh token the dashboard reads info@chlkapp.com with.
 * Read-only: the only scope asked for is `gmail.readonly`.
 *
 *   pnpm gmail:consent                      # prompts for the client ID and secret
 *   GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… pnpm gmail:consent
 *   pnpm gmail:consent -- --mailbox help@chlkapp.com
 *
 * What it does, all on this machine:
 *   1. listens on 127.0.0.1 at a random port (Google's loopback flow);
 *   2. opens (and prints) Google's sign-in page — sign in as the mailbox;
 *   3. takes Google's answer on that port, checks `state`, and swaps the code
 *      for tokens directly with Google (PKCE, S256);
 *   4. checks with Google which inbox granted access;
 *   5. prints the four env vars to paste into Vercel.
 *
 * The refresh token is printed here and nowhere else: it is never written
 * to disk and never sent anywhere but Google's own token endpoint (which
 * issued it). No dependencies — Node 18+ only.
 */
import { spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import http from "node:http"
import { createInterface } from "node:readline"

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
const DEFAULT_MAILBOX = "info@chlkapp.com"
/** Give up if nobody finishes signing in within this long. */
const WAIT_MS = 10 * 60_000

const base64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

function argValue(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Asks on the terminal; `hidden` does not echo what is typed. */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) process.stdout.write(question)
        else if (s.includes("\n") || s.includes("\r")) process.stdout.write("\n")
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
        : ["xdg-open", [url]]
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true })
    child.on("error", () => {})
    child.unref()
  } catch {
    // No browser here; the URL is printed below.
  }
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body>`
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

async function main() {
  const mailbox = (argValue("--mailbox") ?? process.env.GMAIL_MAILBOX ?? DEFAULT_MAILBOX).trim().toLowerCase()
  console.log(`\nGmail consent for ${mailbox} (read-only).\n`)

  const clientId = process.env.GMAIL_CLIENT_ID?.trim() || (await ask("OAuth client ID: "))
  if (!/^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    console.error("That does not look like a Google OAuth client ID (…apps.googleusercontent.com).")
    process.exit(1)
  }
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() || (await ask("OAuth client secret (hidden): ", { hidden: true }))
  if (!clientSecret || /\s/.test(clientSecret)) {
    console.error("A client secret is needed (from the same Desktop app OAuth client).")
    process.exit(1)
  }

  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  const state = base64url(randomBytes(24))

  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`

  const authUrl = `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    login_hint: mailbox,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  })}`

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Google (10 minutes). Run it again.")), WAIT_MS)
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri)
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end()
        return
      }
      const send = (status, title, body) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
        res.end(page(title, body))
      }
      if (url.searchParams.get("state") !== state) {
        send(400, "That link is not from this run", "Go back to the terminal and use the link it printed.")
        return
      }
      const error = url.searchParams.get("error")
      if (error) {
        send(400, "Google did not grant access", `Google said: ${escapeHtml(error)}. Go back to the terminal.`)
        clearTimeout(timer)
        reject(new Error(`Google did not grant access (${error}).`))
        return
      }
      const got = url.searchParams.get("code")
      if (!got) {
        send(400, "No code from Google", "Go back to the terminal and try again.")
        return
      }
      send(200, "Done — go back to the terminal", "You can close this tab.")
      clearTimeout(timer)
      resolve(got)
    })
    console.log(`Opening Google's sign-in page. Sign in as ${mailbox}.`)
    console.log("If no browser opens, paste this link into one on this computer:\n")
    console.log(`  ${authUrl}\n`)
    console.log(`Waiting on http://127.0.0.1:${port} …`)
    openBrowser(authUrl)
  }).finally(() => server.close())

  // The code goes to Google's token endpoint and nowhere else.
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  })
  const tokens = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) {
    throw new Error(`Google refused the code (${tokens.error ?? tokenRes.status}). Check the client ID and secret, then run it again.`)
  }
  const granted = String(tokens.scope ?? "").split(/\s+/).filter(Boolean)
  if (!granted.includes(SCOPE)) throw new Error("Google did not grant read access to Gmail. Run it again and allow it.")
  const extra = granted.filter((s) => s !== SCOPE)
  if (!tokens.refresh_token) {
    throw new Error(
      "Google sent no refresh token. Remove the app at https://myaccount.google.com/permissions (signed in as the mailbox), then run this again."
    )
  }

  // Which inbox said yes — the dashboard can only read the one that did.
  const profileRes = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  const profile = await profileRes.json().catch(() => ({}))
  const granter = String(profile.emailAddress ?? "").toLowerCase()
  if (granter && granter !== mailbox) {
    throw new Error(`You signed in as ${granter}, not ${mailbox}. Run it again and pick ${mailbox} on Google's page.`)
  }

  console.log(`\nDone. ${granter || mailbox} granted read-only Gmail access.`)
  if (extra.length) console.log(`(Google also listed: ${extra.join(", ")} — harmless, the dashboard only reads Gmail.)`)
  console.log("\nPaste these four into Vercel → Settings → Environment Variables (Production only):\n")
  console.log(`  GMAIL_CLIENT_ID=${clientId}`)
  console.log(`  GMAIL_CLIENT_SECRET=${clientSecret}`)
  console.log(`  GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log(`  GMAIL_MAILBOX=${mailbox}`)
  console.log("\nThey were not saved anywhere. Treat the refresh token like a password; clear this terminal when you're done.\n")
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
