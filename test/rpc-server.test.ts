import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { loadGasConfig, ROOT } from './harness';
import { SCHEMA, createLogger, prop, request, setup } from './helpers';
import { DEFAULT_EMAIL } from './mocks';

/** Calls `fn`, expecting the `Error(JSON.stringify(envelope))` the RPC throws. */
function envelopeOf(fn: () => unknown): GasConfigErrorEnvelope {
  try {
    fn();
  } catch (error) {
    return JSON.parse((error as Error).message) as GasConfigErrorEnvelope;
  }
  throw new Error('Expected the call to throw.');
}

/** Stand-ins for gas-error, whose `handle` is spied on. */
function createGasError() {
  class GasError extends Error {
    statusCode: number;
    code: string;
    details?: unknown;
    isOperational = true;

    constructor(
      message: string,
      options: { statusCode?: number; code?: string; details?: unknown } = {},
    ) {
      super(message);
      this.statusCode = options.statusCode ?? 500;
      this.code = options.code ?? 'INTERNAL_ERROR';
      this.details = options.details;
    }

    static handle = vi.fn(
      (
        err: unknown,
        options: {
          logger: {
            warn(m: string, meta?: object): void;
            error(m: string, meta?: object): void;
          };
        },
      ) => {
        if (err instanceof GasError) {
          options.logger.warn('GasError', { code: err.code });
          return {
            ok: false,
            error: err.message,
            status: err.statusCode,
            code: err.code,
            details: err.details,
          };
        }
        options.logger.error('Unexpected error', { message: String(err) });
        return {
          ok: false,
          error: 'Internal Server Error',
          status: 500,
          code: 'INTERNAL_ERROR',
        };
      },
    );
  }

  class GasUnauthorizedError extends GasError {
    constructor(message = 'Unauthorized') {
      super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
    }
  }
  class GasValidationError extends GasError {
    constructor(message = 'Validation failed', details?: unknown) {
      super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
    }
  }
  class GasConflictError extends GasError {
    constructor(message = 'Conflict') {
      super(message, { statusCode: 409, code: 'CONFLICT' });
    }
  }
  return {
    GasError,
    GasUnauthorizedError,
    GasValidationError,
    GasConflictError,
  };
}

const THROWING_SCHEMA = {
  ...SCHEMA,
  boom: {
    type: 'string',
    label: 'Boom',
    validate: (): never => {
      throw new TypeError('db password=hunter2');
    },
  },
} satisfies GasConfigSchema;

describe('GasConfigRpc declaration', () => {
  it('is a function declaration on the global object', () => {
    const { globalThis: global } = loadGasConfig();

    const descriptor = Object.getOwnPropertyDescriptor(global, 'GasConfigRpc');

    expect(descriptor).toBeDefined();
    expect(typeof descriptor?.value).toBe('function');
    // A class or const would not become a property, so this check can fail.
    expect(
      Object.getOwnPropertyDescriptor(global, 'GasConfig'),
    ).toBeUndefined();
  });
});

describe('GasConfigRpc without an instance', () => {
  it('fails with a clear 500', () => {
    const { GasConfigRpc } = loadGasConfig();

    const envelope = envelopeOf(() => GasConfigRpc('getSettings'));

    expect(envelope).toMatchObject({
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(envelope.error).toMatch(/No GasConfig instance.*global scope/);
  });
});

describe('GasConfigRpc routing', () => {
  it('routes to the most recently constructed instance', () => {
    const loaded = loadGasConfig();
    const make = (title: string) =>
      new loaded.GasConfig({
        schema: SCHEMA as GasConfigSchema,
        title,
        logger: createLogger(),
      });

    make('First');
    make('Second');
    expect(
      (loaded.GasConfigRpc('getSettings') as GasConfigSettingsState).title,
    ).toBe('Second');

    make('Third');
    expect(
      (loaded.GasConfigRpc('getSettings') as GasConfigSettingsState).title,
    ).toBe('Third');
  });

  it.each(['nope', 'constructor', '__proto__', 'toString', ''])(
    'rejects the unknown method "%s" as a 400',
    (method) => {
      const { GasConfigRpc } = setup();

      expect(envelopeOf(() => GasConfigRpc(method))).toMatchObject({
        ok: false,
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    },
  );
});

describe('GasConfigRpc getSettings', () => {
  it('returns the state in the shape of the mock server', () => {
    const { GasConfigRpc, mocks } = setup({
      description: 'Tune it.',
      brand: { logoUrl: 'https://example.org/logo.svg' },
      groups: [{ id: 'g', label: 'General' }],
    });

    const state = GasConfigRpc('getSettings') as GasConfigSettingsState;

    expect(Object.keys(state)).toEqual([
      'title',
      'description',
      'brand',
      'groups',
      'fields',
      'canEdit',
      'version',
      'values',
    ]);
    expect(state).toMatchObject({
      title: 'Settings',
      description: 'Tune it.',
      brand: { logoUrl: 'https://example.org/logo.svg' },
      groups: [{ id: 'g', label: 'General' }],
      canEdit: true,
      version: '',
    });
    expect(state.values).toEqual({
      org: null,
      site: null,
      notes: null,
      passMark: 70,
      locale: 'en-GB',
      closesOn: null,
      enabled: true,
      quiet: false,
    });
    expect(state.invalid).toBeUndefined();
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
  });

  it('omits the optional keys when unset and serves non-editors read-only', () => {
    const { GasConfigRpc } = setup({}, { email: 'visitor@example.org' });

    const state = GasConfigRpc('getSettings') as GasConfigSettingsState;

    expect(Object.keys(state)).toEqual([
      'title',
      'groups',
      'fields',
      'canEdit',
      'version',
      'values',
    ]);
    expect(state.canEdit).toBe(false);
  });

  it('matches the state dev/mock-server.js returns', () => {
    const mock = loadMockState();
    const schema: Record<string, unknown> = {};
    for (const { key, rules, ...field } of mock.fields) {
      schema[key] = { ...field, ...rules };
    }
    // The mock stores nothing for empty values; defaults come from the schema.
    const seeded = setup(
      {
        schema: schema as GasConfigSchema,
        title: mock.title,
        description: mock.description as string,
        groups: mock.groups,
        brand: { logoUrl: 'https://example.org/logo.svg' },
      },
      {
        properties: Object.fromEntries(
          Object.entries(mock.values)
            .filter(([, value]) => value !== '' && value !== null)
            .map(([key, value]) => [prop(key), JSON.stringify(value)]),
        ),
      },
    );

    const state = seeded.GasConfigRpc('getSettings') as GasConfigSettingsState;

    expect(Object.keys(state)).toEqual(Object.keys(mock));
    expect(state).toEqual({
      ...mock,
      brand: { logoUrl: 'https://example.org/logo.svg' },
      version: '',
    });
  });

  it('carries the raw stored value of invalid keys and lists them', () => {
    const { GasConfigRpc } = setup(
      {},
      {
        properties: {
          [prop('passMark')]: '"abc"',
          [prop('site')]: '{broken',
          [prop('notes')]: '{"a":1}',
          [prop('locale')]: '"fr-FR"',
          [prop('org')]: '"Acme"',
        },
      },
    );

    const state = GasConfigRpc('getSettings') as GasConfigSettingsState;

    expect(state.invalid).toEqual(['site', 'notes', 'passMark', 'locale']);
    expect(state.values).toMatchObject({
      passMark: 'abc',
      site: '{broken',
      notes: null,
      locale: 'fr-FR',
      org: 'Acme',
    });
  });
});

describe('GasConfigRpc saveSettings', () => {
  it('saves, returns the response without the changed list and logs it', () => {
    const { GasConfigRpc, logger, mocks } = setup();

    const response = GasConfigRpc(
      'saveSettings',
      request({ org: 'Acme', passMark: 80 }, ''),
    ) as GasConfigSaveSuccess;

    expect(response.ok).toBe(true);
    expect(Object.keys(response).sort()).toEqual(['ok', 'values', 'version']);
    expect(response.values).toMatchObject({ org: 'Acme', passMark: 80 });
    expect(mocks.store.get(prop('org'))).toBe('"Acme"');
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('[GasConfig] Settings changed', {
      user: DEFAULT_EMAIL,
      changes: [
        { key: 'org', from: null, to: 'Acme' },
        { key: 'passMark', from: 70, to: 80 },
      ],
    });
  });

  it('logs after the lock is released', () => {
    const { GasConfigRpc, logger, mocks } = setup();
    const held: boolean[] = [];
    logger.info.mockImplementation(() => void held.push(mocks.isLocked()));

    GasConfigRpc('saveSettings', request({ org: 'Acme' }, ''));

    expect(mocks.writes).toEqual([true]);
    expect(held).toEqual([false]);
  });

  it('answers invalid changes without logging', () => {
    const { GasConfigRpc, logger } = setup();

    const response = GasConfigRpc(
      'saveSettings',
      request({ passMark: 500 }, ''),
    ) as GasConfigSaveInvalid;

    expect(response).toMatchObject({ ok: false, reason: 'invalid' });
    expect(response.errors['passMark']).toBeTypeOf('string');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('answers a stale version as a conflict without logging', () => {
    const { GasConfigRpc, logger } = setup();

    expect(
      GasConfigRpc('saveSettings', request({ org: 'Acme' }, 'stale')),
    ).toEqual({ ok: false, reason: 'conflict', version: '' });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('replays a repeated saveId and logs once', () => {
    const { GasConfigRpc, logger } = setup();
    const save = request({ org: 'Acme' }, '', 'same-id');

    const first = GasConfigRpc('saveSettings', save) as GasConfigSaveSuccess;
    const second = GasConfigRpc('saveSettings', save) as GasConfigSaveSuccess;

    expect(second).toEqual(first);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('does not log a save that changed nothing', () => {
    const { GasConfigRpc, logger } = setup();

    GasConfigRpc('saveSettings', request({ passMark: 70 }, ''));

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an editor, naming no email', () => {
    const { GasConfigRpc, logger, mocks } = setup(
      {},
      { email: 'visitor@example.org' },
    );

    const envelope = envelopeOf(() =>
      GasConfigRpc('saveSettings', request({ org: 'Acme' }, '')),
    );

    expect(envelope).toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: '[GasConfig] Not authorized',
    });
    expect(JSON.stringify(envelope)).not.toContain('visitor@example.org');
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('maps a malformed request to a 400', () => {
    const { GasConfigRpc } = setup();

    expect(envelopeOf(() => GasConfigRpc('saveSettings', null))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(
      envelopeOf(() => GasConfigRpc('saveSettings', request({ nope: 1 }, ''))),
    ).toMatchObject({ status: 400, details: { key: 'nope' } });
  });

  it('does not let a throwing logger break the save', () => {
    const logger = {
      info: vi.fn(() => {
        throw new Error('sheet full');
      }),
      warn: vi.fn(() => {
        throw new Error('sheet full');
      }),
    };
    const { GasConfigRpc, mocks } = setup({ logger });

    const response = GasConfigRpc(
      'saveSettings',
      request({ org: 'Acme' }, ''),
    ) as GasConfigSaveSuccess;

    expect(response.ok).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(mocks.console.warn).toHaveBeenCalledWith(
      '[GasConfig] The logger threw while logging.',
      expect.anything(),
    );
  });
});

describe('GasConfigRpc errors without gas-error', () => {
  it('turns a bug into a generic 500 and logs it with logger.warn', () => {
    const { GasConfigRpc, logger } = setup({ schema: THROWING_SCHEMA });

    const envelope = envelopeOf(() =>
      GasConfigRpc('saveSettings', request({ boom: 'x' }, '')),
    );

    expect(envelope).toEqual({
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      error: 'Something went wrong. Try again.',
    });
    expect(JSON.stringify(envelope)).not.toContain('hunter2');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[GasConfig] Unexpected error in GasConfigRpc',
      expect.objectContaining({
        method: 'saveSettings',
        error: 'db password=hunter2',
      }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(DEFAULT_EMAIL);
  });

  it('still answers when the logger throws while reporting', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(() => {
        throw new Error('logger down');
      }),
    };
    const { GasConfigRpc } = setup({ schema: THROWING_SCHEMA, logger });

    expect(
      envelopeOf(() =>
        GasConfigRpc('saveSettings', request({ boom: 'x' }, '')),
      ),
    ).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('serialises a thrown non-Error as a generic 500', () => {
    const { GasConfigRpc, config, logger } = setup();
    vi.spyOn(config, '_readSnapshot').mockImplementation(() => {
      throw 'secret string';
    });

    const envelope = envelopeOf(() => GasConfigRpc('getSettings'));

    expect(envelope.error).toBe('Something went wrong. Try again.');
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('GasConfigRpc errors with gas-error', () => {
  const setupWithGasError = (options: Partial<GasConfigOptions> = {}) => {
    const peer = createGasError();
    return { ...peer, ...setup(options, {}, peer) };
  };

  it('shapes an expected failure through GasError.handle', () => {
    const { GasConfigRpc, GasError, logger } = setupWithGasError();
    const mismatch = request({ org: 'Acme' }, '');

    GasConfigRpc('saveSettings', mismatch);
    const envelope = envelopeOf(() =>
      GasConfigRpc('saveSettings', request({ nope: 1 }, '')),
    );

    expect(envelope).toEqual({
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      error: '[GasConfig] Unknown config key: nope',
      details: { key: 'nope' },
    });
    expect(GasError.handle).toHaveBeenCalledTimes(1);
    expect(GasError.handle).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        rethrow: false,
        method: 'rpc',
        path: 'GasConfigRpc.saveSettings',
        sessionId: 'redacted',
      }),
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-editor through GasUnauthorizedError', () => {
    const peer = createGasError();
    const { GasConfigRpc, logger } = setup(
      {},
      { email: 'visitor@example.org' },
      peer,
    );

    const envelope = envelopeOf(() =>
      GasConfigRpc('saveSettings', request({ org: 'Acme' }, '')),
    );

    expect(envelope).toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: '[GasConfig] Not authorized',
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'visitor@example.org',
    );
  });

  it('reports a bug as the generic envelope, logged once', () => {
    const { GasConfigRpc, GasError, logger } = setupWithGasError({
      schema: THROWING_SCHEMA,
    });

    const envelope = envelopeOf(() =>
      GasConfigRpc('saveSettings', request({ boom: 'x' }, '')),
    );

    expect(envelope).toEqual({
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      error: 'Internal Server Error',
    });
    expect(GasError.handle).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to its own envelope when GasError.handle throws', () => {
    const { GasConfigRpc, GasError } = setupWithGasError();
    GasError.handle.mockImplementation(() => {
      throw new Error('broken peer');
    });

    expect(
      envelopeOf(() => GasConfigRpc('saveSettings', request({ nope: 1 }, ''))),
    ).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('answers a missing instance with a GasError 500', () => {
    const peer = createGasError();
    const { GasConfigRpc } = loadGasConfig({}, peer);

    expect(envelopeOf(() => GasConfigRpc('getSettings'))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      error: expect.stringContaining('No GasConfig instance'),
    });
  });
});

/** Runs dev/mock-server.js against a stub window and returns its state. */
function loadMockState(): GasConfigSettingsState & Record<string, unknown> {
  const context = vm.createContext({
    window: {
      location: { search: '' },
      setTimeout: (fn: () => void) => fn(),
    },
    URLSearchParams,
    JSON,
    Object,
    Error,
  });
  vm.runInContext(
    `${readFileSync(`${ROOT}dev/mock-server.js`, 'utf8')}; this.google = google;`,
    context,
  );

  let state: unknown;
  (
    context['google'] as {
      script: {
        run: {
          withSuccessHandler(fn: (value: unknown) => void): {
            GasConfigRpc(method: string): void;
          };
        };
      };
    }
  ).script.run
    .withSuccessHandler((value) => (state = value))
    .GasConfigRpc('getSettings');
  return state as GasConfigSettingsState & Record<string, unknown>;
}
