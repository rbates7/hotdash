import { ZodError } from "zod"

import { AppError } from "./errors"
import { isSameOrigin } from "@/lib/gate/same-origin"

export function refuseCrossSite(request: Request): Response | null {
  return isSameOrigin(request)
    ? null
    : Response.json(
        { error: "Cross-site request refused.", code: "forbidden" },
        { status: 403 }
      )
}

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
  console.error(error)
  return Response.json(
    { error: fallback, code: "internal_error" },
    { status: 500 }
  )
}
