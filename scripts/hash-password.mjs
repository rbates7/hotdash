#!/usr/bin/env node
/**
 * Print an ADMIN_PASSWORD_HASH for the sign-in lock.
 *
 *   pnpm auth:hash                      # prompts (input hidden), twice
 *   printf '%s' "$PW" | pnpm -s auth:hash   # reads stdin when piped
 *
 * The password is never taken as an argument, so it stays out of shell
 * history and `ps`. Output format matches src/lib/auth/password.ts:
 * scrypt$N$r$p$saltB64$hashB64. Keep the two in step.
 */
import { randomBytes, scrypt } from "node:crypto"
import { stdin, stdout, stderr, exit } from "node:process"

const N = 2 ** 15
const r = 8
const p = 1
const SALT_BYTES = 16
const KEY_BYTES = 32

function hash(password) {
  const salt = randomBytes(SALT_BYTES)
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_BYTES,
      { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
      (err, key) =>
        err
          ? reject(err)
          : resolve(["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$"))
    )
  })
}

async function readPiped() {
  let text = ""
  for await (const chunk of stdin) text += chunk
  // Drop one trailing newline from `echo`, nothing else.
  return text.replace(/\r?\n$/, "")
}

/** Prompt on the terminal without echoing what is typed. */
function prompt(question) {
  return new Promise((resolve) => {
    stderr.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    let value = ""
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off("data", onData)
          stderr.write("\n")
          resolve(value)
          return
        }
        if (ch === "\u0003") {
          stderr.write("\n")
          exit(130)
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on("data", onData)
  })
}

async function main() {
  let password
  if (stdin.isTTY) {
    password = await prompt("Password: ")
    const again = await prompt("Again: ")
    if (password !== again) {
      stderr.write("Passwords did not match.\n")
      exit(1)
    }
  } else {
    password = await readPiped()
  }

  if (password.length < 12) {
    stderr.write("Use at least 12 characters.\n")
    exit(1)
  }

  const value = await hash(password)
  stdout.write(`${value}\n`)
  if (stdout.isTTY) {
    // Next's .env loader expands $NAME even inside single quotes; only \$ is literal.
    stderr.write(
      "\nVercel / CI: paste the line above as ADMIN_PASSWORD_HASH, as-is.\n" +
        "Local .env.local: every $ must be escaped, like this:\n\n" +
        `ADMIN_PASSWORD_HASH=${value.replaceAll("$", "\\$")}\n`
    )
  }
}

main().catch((err) => {
  stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  exit(1)
})
