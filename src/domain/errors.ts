/**
 * Application error types following P7 (explicit error handling)
 * Each error type maps to specific HTTP status codes and client actions
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Actual Budget API errors (502 Bad Gateway)
 */
export class ActualBudgetError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'ACTUAL_API_ERROR', 502, details);
  }
}

/**
 * OpenAI API errors (502 Bad Gateway)
 * @deprecated Use AIError instead for new code
 */
export class OpenAIError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'OPENAI_API_ERROR', 502, details);
  }
}

/**
 * Generic AI API errors (502 Bad Gateway) - used by all AI backends
 */
export class AIError extends AppError {
  constructor(
    message: string,
    public readonly backend: string,
    details?: unknown
  ) {
    super(message, 'AI_API_ERROR', 502, { backend, ...(details as object) });
  }
}

/**
 * Database operation errors (500 Internal Server Error)
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

/**
 * Validation errors from user input (400 Bad Request)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Resource not found errors (404 Not Found)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404, { resource, id });
  }
}

/**
 * Configuration errors - fail fast on startup (500 Internal Server Error)
 */
export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIG_ERROR', 500, details);
  }
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
