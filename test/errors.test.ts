import { describe, expect, it } from 'vitest';
import { loadGasConfig } from './harness';
import { request, setup } from './helpers';

/** Stand-ins for gas-error's classes, which carry the same fields. */
class GasValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  constructor(
    message?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

describe('errors: without gas-error', () => {
  it('builds a validation GasConfigError', () => {
    const { _GasConfigErrors, GasConfigError } = loadGasConfig();

    const error = _GasConfigErrors.validation('[GasConfig] Bad input', {
      key: 'k',
    });

    expect(error).toBeInstanceOf(GasConfigError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'GasConfigError',
      message: '[GasConfig] Bad input',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: { key: 'k' },
      isOperational: true,
    });
    expect(error.stack).toContain('Bad input');
  });

  it('is what a malformed save throws', () => {
    const { config, GasConfigError } = setup();

    expect(() => config._saveChanges(request({ nope: 1 }))).toThrow(
      GasConfigError,
    );
  });
});

describe('errors: with gas-error', () => {
  const globals = { GasValidationError };

  it('builds the gas-error classes', () => {
    const { _GasConfigErrors, GasConfigError } = loadGasConfig({}, globals);

    const validation = _GasConfigErrors.validation('[GasConfig] Bad', { a: 1 });

    expect(validation).toBeInstanceOf(GasValidationError);
    expect(validation).not.toBeInstanceOf(GasConfigError);
    expect(validation).toMatchObject({ details: { a: 1 } });
  });

  it('is what a malformed save throws', () => {
    const { config } = setup({}, {}, globals);

    let thrown: unknown;
    try {
      config._saveChanges(request({ nope: 1 }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GasValidationError);
    expect((thrown as Error).message).toBe(
      '[GasConfig] Unknown config key: nope',
    );
  });

  it('keeps configuration errors as plain Errors', () => {
    const { GasConfig } = loadGasConfig({}, globals);

    let thrown: unknown;
    try {
      new GasConfig({ schema: { 'bad key': {} } as never });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).constructor).toBe(Error);
  });
});
