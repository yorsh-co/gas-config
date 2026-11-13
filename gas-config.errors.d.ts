/** Codes of the expected failures gas-config throws. */
type GasConfigErrorCode = 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';
/**
 * Expected failure thrown when gas-error is not loaded. Carries the same
 * fields as gas-error's base error, so a consumer can map either in one line.
 * Configuration and programmer errors are plain `Error`s instead.
 */
declare class GasConfigError extends Error {
    statusCode: number;
    code: GasConfigErrorCode;
    details: unknown;
    isOperational: true;
    constructor(message: string, statusCode: number, code: GasConfigErrorCode, details?: unknown);
}
/**
 * Builds the error to throw for an expected failure: the matching gas-error
 * class when it is loaded, else a `GasConfigError`. Availability is checked at
 * throw time, so the Apps Script file push order does not matter.
 */
declare const _GasConfigErrors: Readonly<{
    /** 400 `VALIDATION_ERROR`: the caller passed unusable input. */
    validation(message: string, details?: unknown): Error;
    /** 401 `UNAUTHORIZED`: the user is unidentified or not an editor. */
    unauthorized(message: string): Error;
    /** 500 `INTERNAL_ERROR`: a failure whose message is safe to show. */
    internal(message: string): Error;
}>;
