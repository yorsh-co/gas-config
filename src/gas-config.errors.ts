/** Codes of the expected failures gas-config throws. */
type GasConfigErrorCode = 'VALIDATION_ERROR' | 'CONFLICT' | 'UNAUTHORIZED';

/**
 * Expected failure thrown when gas-error is not loaded. Carries the same
 * fields as gas-error's base error, so a consumer can map either in one line.
 * Configuration and programmer errors are plain `Error`s instead.
 */
class GasConfigError extends Error {
  statusCode: number;
  code: GasConfigErrorCode;
  details: unknown;
  isOperational: true;

  constructor(
    message: string,
    statusCode: number,
    code: GasConfigErrorCode,
    details?: unknown,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Builds the error to throw for an expected failure: the matching gas-error
 * class when it is loaded, else a `GasConfigError`. Availability is checked at
 * throw time, so the Apps Script file push order does not matter.
 */
const _GasConfigErrors = Object.freeze({
  /** 400 `VALIDATION_ERROR`: the caller passed unusable input. */
  validation(message: string, details?: unknown): Error {
    return typeof GasValidationError === 'function'
      ? new GasValidationError(message, details)
      : new GasConfigError(message, 400, 'VALIDATION_ERROR', details);
  },

  /** 409 `CONFLICT`: the stored settings changed since they were read. */
  conflict(message: string): Error {
    return typeof GasConflictError === 'function'
      ? new GasConflictError(message)
      : new GasConfigError(message, 409, 'CONFLICT');
  },

  /** 401 `UNAUTHORIZED`: the user is unidentified or not an editor. */
  unauthorized(message: string): Error {
    return typeof GasUnauthorizedError === 'function'
      ? new GasUnauthorizedError(message)
      : new GasConfigError(message, 401, 'UNAUTHORIZED');
  },
});
