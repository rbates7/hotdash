export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.status = status
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request.") {
    super(message, "validation_error", 400)
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required.") {
    super(message, "auth_required", 401)
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, "not_found", 404)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict.", code = "conflict") {
    super(message, code, 409)
  }
}

export class IntegrationError extends AppError {
  constructor(message: string) {
    super(message, "integration_error", 502)
  }
}
