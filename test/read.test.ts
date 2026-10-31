import { describe, expect, it } from 'vitest';
import { loadGasConfig } from './harness';
import { SCHEMA, prop, setup } from './helpers';

describe('construction', () => {
  it('touches no Apps Script service', () => {
    const { GasConfig, mocks } = loadGasConfig();

    new GasConfig({ schema: SCHEMA as GasConfigSchema });

    expect(mocks.PropertiesService.getScriptProperties).not.toHaveBeenCalled();
    expect(mocks.properties.getProperties).not.toHaveBeenCalled();
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(mocks.Utilities.getUuid).not.toHaveBeenCalled();
    expect(mocks.console.log).not.toHaveBeenCalled();
    expect(mocks.console.warn).not.toHaveBeenCalled();
  });

  it('constructs where no Apps Script service exists at all', () => {
    const { GasConfig } = loadGasConfig({}, { PropertiesService: undefined });

    expect(
      () => new GasConfig({ schema: SCHEMA as GasConfigSchema }),
    ).not.toThrow();
  });

  it('reads Script Properties on first use only', () => {
    const { config, mocks } = setup();

    expect(mocks.PropertiesService.getScriptProperties).not.toHaveBeenCalled();
    config.get('org');
    expect(mocks.PropertiesService.getScriptProperties).toHaveBeenCalledTimes(
      1,
    );
  });
});

describe('get', () => {
  it('throws for an unknown key without reading', () => {
    const { config, mocks } = setup();

    expect(() => config.get('nope')).toThrow(
      '[GasConfig] Unknown config key: nope',
    );
    expect(mocks.properties.getProperties).not.toHaveBeenCalled();
  });

  it.each(['__version', '__saveId', 'constructor', '__proto__', 'toString'])(
    'throws for the non-schema key %s',
    (key) => {
      const { config } = setup();

      expect(() => config.get(key)).toThrow(
        `[GasConfig] Unknown config key: ${key}`,
      );
    },
  );

  it('returns the default while nothing is stored', () => {
    const { config } = setup();

    expect(config.get('passMark')).toBe(70);
    expect(config.get('locale')).toBe('en-GB');
    expect(config.get('enabled')).toBe(true);
  });

  it('returns null for an empty field without a default', () => {
    const { config } = setup();

    expect(config.get('site')).toBeNull();
    expect(config.get('closesOn')).toBeNull();
    expect(config.get('org')).toBeNull();
  });

  it('returns false for a boolean without a default', () => {
    const { config } = setup();

    expect(config.get('quiet')).toBe(false);
  });

  it('returns stored values of every type', () => {
    const { config } = setup(
      {},
      {
        properties: {
          [prop('org')]: '"Acme"',
          [prop('site')]: '"https://example.org"',
          [prop('passMark')]: '0',
          [prop('locale')]: '"pt-BR"',
          [prop('closesOn')]: '"2026-12-31"',
          [prop('enabled')]: 'false',
          [prop('quiet')]: 'true',
        },
      },
    );

    expect(config.getAll()).toEqual({
      org: 'Acme',
      site: 'https://example.org',
      notes: null,
      passMark: 0,
      locale: 'pt-BR',
      closesOn: '2026-12-31',
      enabled: false,
      quiet: true,
    });
  });

  it('reads the properties once, then serves from memory', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"A"' } },
    );

    config.get('org');
    config.get('passMark');
    config.getAll();

    expect(mocks.properties.getProperties).toHaveBeenCalledTimes(1);
    expect(mocks.properties.getProperty).not.toHaveBeenCalled();
  });

  it('ignores properties it does not own', () => {
    const { config } = setup(
      {},
      { properties: { org: '"Other"', [prop('__version')]: 'v1' } },
    );

    expect(config.get('org')).toBeNull();
  });

  it('treats a stored null or empty string as unset', () => {
    const { config, logger } = setup(
      {},
      { properties: { [prop('passMark')]: 'null', [prop('org')]: '""' } },
    );

    expect(config.get('passMark')).toBe(70);
    expect(config.get('org')).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('invalid stored values', () => {
  const secret = 'S3CRET-VALUE';

  it.each([
    ['passMark', 'not json{'],
    ['passMark', '"70"'],
    ['passMark', '101'],
    ['passMark', '1.5'],
    ['passMark', `"${secret}"`],
    ['enabled', '"yes"'],
    ['enabled', '1'],
    ['locale', '"fr-FR"'],
    ['closesOn', '"2026-02-30"'],
    ['site', '"http://example.org"'],
    ['notes', `"${secret}-and-far-too-long"`],
    ['org', '{"a":1}'],
    ['org', '[]'],
  ])('falls back to the default for %s = %s', (key, stored) => {
    const { config, logger } = setup(
      {},
      { properties: { [prop(key)]: stored } },
    );
    const defaults = setup().config;

    expect(config.get(key)).toBe(defaults.get(key));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[1]).toEqual({ key });
  });

  it('names the key in the warning but never the value', () => {
    const { config, logger } = setup(
      {},
      { properties: { [prop('passMark')]: `"${secret}"` } },
    );

    config.get('passMark');

    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('passMark');
    expect(logged).not.toContain(secret);
  });

  it('does not make other keys unreadable', () => {
    const { config } = setup(
      {},
      {
        properties: {
          [prop('passMark')]: 'garbage{',
          [prop('org')]: '"Acme"',
          [prop('locale')]: '"pt-BR"',
        },
      },
    );

    expect(config.get('org')).toBe('Acme');
    expect(config.get('locale')).toBe('pt-BR');
    expect(config.get('passMark')).toBe(70);
  });

  it('warns only for the key requested by get', () => {
    const { config, logger } = setup(
      {},
      { properties: { [prop('passMark')]: 'x{', [prop('enabled')]: '"y"' } },
    );

    config.get('org');
    expect(logger.warn).not.toHaveBeenCalled();

    config.get('passMark');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('warns for every invalid key on getAll, once per key', () => {
    const { config, logger } = setup(
      {},
      { properties: { [prop('passMark')]: 'x{', [prop('enabled')]: '"y"' } },
    );

    config.getAll();
    config.getAll();
    config.get('passMark');

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls.map((call) => call[1])).toEqual([
      { key: 'passMark' },
      { key: 'enabled' },
    ]);
  });

  it('keeps reading when the logger throws', () => {
    const { config, logger, mocks } = setup(
      {},
      { properties: { [prop('passMark')]: 'x{' } },
    );
    logger.warn.mockImplementation(() => {
      throw new Error('logger down');
    });

    expect(config.get('passMark')).toBe(70);
    expect(mocks.console.warn).toHaveBeenCalledTimes(1);
  });

  it('logs through the execution log with the prefix when no logger is given', () => {
    const { GasConfig, mocks } = loadGasConfig({
      properties: { [prop('passMark')]: 'x{' },
    });
    const config = new GasConfig({ schema: SCHEMA as GasConfigSchema });

    config.get('passMark');

    expect(mocks.console.warn).toHaveBeenCalledWith(
      '[GasConfig] Stored value for "passMark" is invalid; using the default.',
      { key: 'passMark' },
    );
  });
});

describe('getAll', () => {
  it('returns every key', () => {
    const { config } = setup();

    expect(Object.keys(config.getAll())).toEqual(Object.keys(SCHEMA));
  });

  it('returns a fresh object each call', () => {
    const { config } = setup();
    const first = config.getAll();
    first.passMark = 1;
    first.org = 'mutated';

    const second = config.getAll();

    expect(second).not.toBe(first);
    expect(second.passMark).toBe(70);
    expect(second.org).toBeNull();
    expect(config.get('passMark')).toBe(70);
  });
});

describe('logger and lock options', () => {
  it('rejects a logger without info and warn', () => {
    const { GasConfig } = loadGasConfig();
    const schema = SCHEMA as GasConfigSchema;

    expect(() => new GasConfig({ schema, logger: {} as never })).toThrow(
      /^\[GasConfig\] Invalid "logger"/,
    );
    expect(() => new GasConfig({ schema, logger: null as never })).toThrow(
      /Invalid "logger"/,
    );
  });

  it('accepts console as the logger', () => {
    const { GasConfig, mocks } = loadGasConfig();

    expect(
      () =>
        new GasConfig({
          schema: SCHEMA as GasConfigSchema,
          logger: mocks.console,
        }),
    ).not.toThrow();
  });

  it('rejects a lockService without withLock', () => {
    const { GasConfig, mocks } = loadGasConfig();
    const schema = SCHEMA as GasConfigSchema;

    expect(
      () => new GasConfig({ schema, lockService: mocks.LockService as never }),
    ).toThrow(/^\[GasConfig\] Invalid "lockService"/);
  });

  it.each([0, -1, NaN, Infinity, '30000'])(
    'rejects a lockTimeoutMs of %j',
    (lockTimeoutMs) => {
      const { GasConfig } = loadGasConfig();

      expect(
        () =>
          new GasConfig({
            schema: SCHEMA as GasConfigSchema,
            lockTimeoutMs: lockTimeoutMs as number,
          }),
      ).toThrow(/^\[GasConfig\] Invalid "lockTimeoutMs"/);
    },
  );

  it('defaults lockTimeoutMs to 30000', () => {
    const { config } = setup();

    expect(config.lockTimeoutMs).toBe(30000);
  });
});
