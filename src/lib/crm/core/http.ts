import { ZodError } from "zod"

import { AppError } from "./errors"
import { logError } from "./log"

export function jsonError(error: unknown, fallback: string): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status }
    )
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Invalid request.", code: "validation_error" },
      { status: 400 }
    )
  }
  logError("api", error)
  return Response.json(
    { error: fallback, code: "internal_error" },
    { status: 500 }
  )
}
