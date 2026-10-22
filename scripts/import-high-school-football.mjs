import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import XLSX from "xlsx"

const DEFAULT_SOURCE = resolve(
  process.env.HOME ?? "",
  "Downloads/all football teams final - by state.xlsx"
)
const OUTPUT = new URL("../data/sales-map/high-school-football.csv", import.meta.url)

const sourcePath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SOURCE

function slugFromMaxprepsUrl(url) {
  const match = String(url ?? "").match(/maxpreps\.com\/[^/]+\/[^/]+\/([^/]+)\/football\/?$/i)
  return match?.[1] ?? ""
}

function sanitizeMetro(value) {
  const metro = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!metro || metro.includes("\n") || /region/i.test(metro) || metro.length > 80) return ""
  return metro
}

function main() {
  const workbook = XLSX.read(Buffer.from(readFileSync(sourcePath)), { type: "buffer", cellDates: false })
  const rows = []
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "SUMMARY") continue
    const sheet = workbook.Sheets[sheetName]
    const parsed = XLSX.utils.sheet_to_json(sheet, { defval: "" })
    for (const row of parsed) {
      const teamName = String(row.team_name ?? "").trim()
      const city = String(row.city ?? "").trim()
      const state = String(row.state ?? sheetName).trim().toUpperCase()
      const maxprepsUrl = String(row.maxpreps_url ?? "").trim()
      if (!teamName || !city || !STATE_CODES.has(state)) continue
      rows.push({
        team_name: teamName,
        city,
        state,
        classification: String(row.classification ?? "").trim(),
        metro: sanitizeMetro(row.metro),
        maxpreps_url: maxprepsUrl,
        maxpreps_slug: slugFromMaxprepsUrl(maxprepsUrl),
      })
    }
  }

  rows.sort(
    (a, b) =>
      a.state.localeCompare(b.state) ||
      a.city.localeCompare(b.city, "en", { sensitivity: "base" }) ||
      a.team_name.localeCompare(b.team_name, "en", { sensitivity: "base" })
  )

  const columns = ["team_name", "city", "state", "classification", "metro", "maxpreps_url", "maxpreps_slug"]
  const escape = (value) => {
    const text = String(value ?? "")
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => escape(row[key])).join(",")),
  ]
  return { csv: `${lines.join("\n")}\n`, count: rows.length }
}

const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY",
])

const { csv, count } = main()
await mkdir(dirname(fileURLToPath(OUTPUT)), { recursive: true })
await writeFile(OUTPUT, csv)
process.stdout.write(`Wrote ${count.toLocaleString()} high school football teams to ${fileURLToPath(OUTPUT)}\n`)
