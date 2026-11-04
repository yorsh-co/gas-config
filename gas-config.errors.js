'use strict';
/**
 * Expected failure thrown when gas-error is not loaded. Carries the same
 * fields as gas-error's base error, so a consumer can map either in one line.
 * Configuration and programmer errors are plain `Error`s instead.
 */
class GasConfigError extends Error {
  constructor(message, statusCode, code, details) {
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
  validation(message, details) {
    return typeof GasValidationError === 'function'
      ? new GasValidationError(message, details)
      : new GasConfigError(message, 400, 'VALIDATION_ERROR', details);
  },
  /** 401 `UNAUTHORIZED`: the user is unidentified or not an editor. */
  unauthorized(message) {
    return typeof GasUnauthorizedError === 'function'
      ? new GasUnauthorizedError(message)
      : new GasConfigError(message, 401, 'UNAUTHORIZED');
  },
  /** 500 `INTERNAL_ERROR`: a failure whose message is safe to show. */
  internal(message) {
    return typeof GasError === 'function'
      ? new GasError(message, { statusCode: 500, code: 'INTERNAL_ERROR' })
      : new GasConfigError(message, 500, 'INTERNAL_ERROR');
  },
});
