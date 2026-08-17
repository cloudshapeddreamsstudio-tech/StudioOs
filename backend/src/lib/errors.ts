/**
 * One error type for anything that should become a non-500 HTTP response.
 * Anything else that throws is a genuine bug and becomes a 500 with the
 * message logged but not leaked.
 */
export class AppError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Resource') {
    super(`${what} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

/** Upstream ERPNext returned a non-2xx. Preserves its status and body. */
export class FrappeError extends AppError {
  constructor(status: number, details?: unknown) {
    super(`ERPNext API error ${status}`, status, details);
    this.name = 'FrappeError';
  }
}
