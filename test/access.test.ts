import { describe, expect, it } from 'vitest';
import { loadGasConfig } from './harness';
import { DEFAULT_EMAIL } from './mocks';
import { SCHEMA, prop, request, setup } from './helpers';

/** Class stand-in for gas-error's `GasUnauthorizedError`. */
class GasUnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
}

/** Captures what a call throws. */
function thrownBy(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the call to throw');
}

describe('editors: normalisation', () => {
  const editors = (list: unknown) =>
    setup({ editors: list as string[] }).config.editors;

  it('trims and lowercases', () => {
    expect(editors(['  Ann@Example.ORG ', 'bob@example.org'])).toEqual([
      'ann@example.org',
      'bob@example.org',
    ]);
  });

  it('collapses duplicates, ignoring case', () => {
    expect(
      editors(['a@example.org', 'A@EXAMPLE.ORG', ' a@example.org']),
    ).toEqual(['a@example.org']);
  });

  it('defaults to nobody', () => {
    const { GasConfig } = loadGasConfig();

    expect(new GasConfig({ schema: SCHEMA }).editors).toEqual([]);
    expect(editors([])).toEqual([]);
  });

  it('copies the list', () => {
    const source = ['a@example.org'];
    const config = setup({ editors: source }).config;

    source.push('b@example.org');

    expect(config.editors).toEqual(['a@example.org']);
  });
});

describe('editors: validation', () => {
  it.each([
    ['a string', 'a@example.org'],
    ['null', null],
    ['an empty entry', ['']],
    ['a blank entry', ['  ']],
    ['a non-string entry', [5]],
  ])('rejects %s', (_name, list) => {
    expect(() => setup({ editors: list as never })).toThrow(
      /^\[GasConfig\] Invalid "editors": expected an array of non-empty email strings\.$/,
    );
  });

  it.each(['plain', 'a@b', '@example.org', 'a@', 'a b@example.org', 'a@@b.c'])(
    'rejects %j as not an email address',
    (email) => {
      const error = thrownBy(() => setup({ editors: [email] }));

      expect(error.constructor).toBe(Error);
      expect(error.message).toBe(
        `[GasConfig] Invalid "editors": "${email.toLowerCase()}" is not an email address.`,
      );
    },
  );
});

describe('access: authorization', () => {
  it('lets a listed editor save', () => {
    const { config } = setup();

    expect(config._canEdit()).toBe(true);
    expect(config._saveChanges(request({ org: 'A' })).ok).toBe(true);
  });

  it('matches case-insensitively in both directions', () => {
    const upper = setup(
      { editors: ['editor@example.org'] },
      { email: 'EDITOR@Example.ORG' },
    );
    const lower = setup(
      { editors: ['EDITOR@Example.ORG'] },
      { email: 'editor@example.org' },
    );

    expect(upper.config._canEdit()).toBe(true);
    expect(lower.config._canEdit()).toBe(true);
    expect(upper.config._saveChanges(request({ org: 'A' })).ok).toBe(true);
  });

  it('refuses a user who is not listed', () => {
    const { config, mocks } = setup({}, { email: 'other@example.org' });

    expect(config._canEdit()).toBe(false);
    expect(
      thrownBy(() => config._saveChanges(request({ org: 'A' }))),
    ).toMatchObject({
      message: '[GasConfig] Not authorized',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(mocks.store.size).toBe(0);
  });

  it('refuses everyone when editors is empty or omitted', () => {
    const empty = setup({ editors: [] });
    const omitted = setup({ editors: undefined as never });

    for (const { config } of [empty, omitted]) {
      expect(config._canEdit()).toBe(false);
      expect(
        thrownBy(() => config._saveChanges(request({ org: 'A' }))),
      ).toMatchObject({
        message: '[GasConfig] Not authorized',
        statusCode: 401,
      });
    }
  });

  it('refuses a user whose email is empty', () => {
    const { config } = setup({}, { email: '' });

    expect(config._canEdit()).toBe(false);
    expect(config._userEmail()).toBeNull();
    expect(
      thrownBy(() => config._saveChanges(request({ org: 'A' }))),
    ).toMatchObject({
      message: '[GasConfig] Unable to identify the signed-in user',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses a user when Session throws, without throwing from the check', () => {
    const { config } = setup({}, { email: new Error('scope declined') });

    expect(() => config._canEdit()).not.toThrow();
    expect(config._canEdit()).toBe(false);
    expect(config._userEmail()).toBeNull();
    expect(
      thrownBy(() => config._saveChanges(request({ org: 'A' }))),
    ).toMatchObject({
      message: '[GasConfig] Unable to identify the signed-in user',
    });
  });

  it('refuses a blank email even if a blank were listed', () => {
    const { config } = setup({}, { email: '   ' });

    expect(config._canEdit()).toBe(false);
  });

  it('exposes the identified email for change logging', () => {
    expect(setup().config._userEmail()).toBe(DEFAULT_EMAIL);
  });

  it('never puts the email in a message', () => {
    const email = 'someone.secret@example.org';
    const unlisted = setup({}, { email });
    const messages = [
      thrownBy(() => unlisted.config._saveChanges(request({ org: 'A' }))),
      thrownBy(() =>
        setup(
          {},
          { email: new Error(`no access for ${email}`) },
        ).config._saveChanges(request({ org: 'A' })),
      ),
      thrownBy(() =>
        setup({}, { email: '' }).config._saveChanges(request({ org: 'A' })),
      ),
    ].map((error) => JSON.stringify([error.message, error]));

    for (const message of messages) expect(message).not.toContain('secret');
  });
});

describe('access: errors', () => {
  it('throws a GasConfigError 401 without gas-error', () => {
    const { config, GasConfigError } = setup(
      {},
      { email: 'other@example.org' },
    );

    const error = thrownBy(() => config._saveChanges(request({ org: 'A' })));

    expect(error).toBeInstanceOf(GasConfigError);
    expect(error).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      isOperational: true,
    });
  });

  it('throws GasUnauthorizedError when gas-error is loaded', () => {
    const { config, GasConfigError } = setup(
      {},
      { email: '' },
      { GasUnauthorizedError },
    );

    const error = thrownBy(() => config._saveChanges(request({ org: 'A' })));

    expect(error).toBeInstanceOf(GasUnauthorizedError);
    expect(error).not.toBeInstanceOf(GasConfigError);
    expect(error.message).toBe(
      '[GasConfig] Unable to identify the signed-in user',
    );
  });

  it('builds both through the factory', () => {
    const bare = loadGasConfig();
    const peer = loadGasConfig({}, { GasUnauthorizedError });

    expect(bare._GasConfigErrors.unauthorized('[GasConfig] x')).toBeInstanceOf(
      bare.GasConfigError,
    );
    expect(peer._GasConfigErrors.unauthorized('[GasConfig] x')).toBeInstanceOf(
      GasUnauthorizedError,
    );
  });
});

describe('access: nothing is spent on an unauthorized save', () => {
  it.each([
    ['unlisted', { email: 'other@example.org' }],
    ['unidentified', { email: '' }],
    ['throwing', { email: new Error('declined') }],
  ])('rejects a %s user before locking or reading', (_name, mockOptions) => {
    const { config, mocks } = setup({}, mockOptions);

    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow();

    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(mocks.PropertiesService.getScriptProperties).not.toHaveBeenCalled();
    expect(mocks.properties.getProperties).not.toHaveBeenCalled();
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(mocks.Utilities.getUuid).not.toHaveBeenCalled();
  });

  it('rejects before even validating the request', () => {
    const { config } = setup({}, { email: 'other@example.org' });

    expect(
      thrownBy(() => config._saveChanges(request({ nope: 1 }))),
    ).toMatchObject({ statusCode: 401 });
  });

  it('does not use an injected lockService', () => {
    const lockService = { withLock: () => undefined as never };
    const calls: unknown[] = [];
    lockService.withLock = (...args: unknown[]) => calls.push(args) as never;
    const { config } = setup({ lockService }, { email: 'other@example.org' });

    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow();
    expect(calls).toEqual([]);
  });
});

describe('access: Session is read lazily and once', () => {
  it('is not touched at construction', () => {
    const { mocks } = setup();

    expect(mocks.Session.getActiveUser).not.toHaveBeenCalled();
    expect(mocks.Session.user.getEmail).not.toHaveBeenCalled();
  });

  it('is not touched by reads', () => {
    const { config, mocks } = setup();

    config.get('org');
    config.getAll();
    config._readSnapshot();

    expect(mocks.Session.getActiveUser).not.toHaveBeenCalled();
  });

  it('is read once per instance across checks and saves', () => {
    const { config, mocks } = setup();

    config._canEdit();
    config._userEmail();
    const first = config._saveChanges(request({ org: 'A' }));
    if (!first.ok) throw new Error('save failed');
    config._saveChanges(request({ org: 'B' }, first.version));

    expect(mocks.Session.getActiveUser).toHaveBeenCalledTimes(1);
    expect(mocks.Session.user.getEmail).toHaveBeenCalledTimes(1);
  });

  it('caches a failed identification too', () => {
    const { config, mocks } = setup({}, { email: new Error('declined') });

    config._canEdit();
    config._canEdit();
    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow();

    expect(mocks.Session.user.getEmail).toHaveBeenCalledTimes(1);
  });

  it('is read separately by each instance', () => {
    const { config, mocks, GasConfig } = setup();
    const other = new GasConfig({ schema: SCHEMA, editors: [DEFAULT_EMAIL] });

    config._canEdit();
    other._canEdit();

    expect(mocks.Session.user.getEmail).toHaveBeenCalledTimes(2);
  });
});

describe('access: reads are never gated', () => {
  it.each([
    ['unlisted', { email: 'other@example.org' }],
    ['unidentified', { email: '' }],
    ['throwing', { email: new Error('declined') }],
  ])('get and getAll work for a %s user', (_name, mockOptions) => {
    const { config } = setup(
      {},
      { ...mockOptions, properties: { [prop('org')]: '"Acme"' } },
    );

    expect(config.get('org')).toBe('Acme');
    expect(config.getAll().passMark).toBe(70);
    expect(config._readSnapshot().values.org).toBe('Acme');
  });

  it('works with no editors at all', () => {
    const { config } = setup(
      { editors: [] },
      { properties: { [prop('org')]: '"Acme"' } },
    );

    expect(config.get('org')).toBe('Acme');
  });
});
