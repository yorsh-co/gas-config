import { describe, expect, it, vi } from 'vitest';
import { PROPERTIES_WRITE_FAILURE } from './mocks';
import { prop, request, setup } from './helpers';

/** Narrows a save outcome to a success, failing the test otherwise. */
function applied(outcome: GasConfigSaveOutcome): GasConfigSaveApplied {
  if (!outcome.ok) throw new Error(`Expected success, got ${outcome.reason}`);
  return outcome;
}

describe('save: success', () => {
  it('writes the changed keys, a new version and the saveId', () => {
    const { config, mocks } = setup();

    const outcome = applied(
      config._saveChanges(request({ org: 'Acme', passMark: 80 }, '', 's1')),
    );

    expect(Object.fromEntries(mocks.store)).toEqual({
      [prop('org')]: '"Acme"',
      [prop('passMark')]: '80',
      [prop('__version')]: '00000000-0000-4000-8000-000000000001',
      [prop('__saveId')]: 's1',
    });
    expect(outcome.version).toBe('00000000-0000-4000-8000-000000000001');
    expect(outcome.values.org).toBe('Acme');
    expect(outcome.values.passMark).toBe(80);
    expect(outcome.values.locale).toBe('en-GB');
    expect(outcome.changed).toEqual([
      { key: 'org', from: null, to: 'Acme' },
      { key: 'passMark', from: 70, to: 80 },
    ]);
  });

  it('writes in one setProperties call without deleting others', () => {
    const { config, mocks } = setup();

    config._saveChanges(request({ org: 'Acme', passMark: 80 }));

    expect(mocks.properties.setProperties).toHaveBeenCalledTimes(1);
    expect(mocks.properties.setProperties.mock.calls[0]?.[1]).toBe(false);
    expect(mocks.properties.deleteProperty).not.toHaveBeenCalled();
  });

  it('JSON-encodes every type so values round-trip', () => {
    const { config, mocks } = setup();

    config._saveChanges(
      request({
        org: 'A "quoted" name',
        passMark: 0,
        enabled: false,
        quiet: true,
        closesOn: '2026-12-31',
      }),
    );

    expect(mocks.store.get(prop('org'))).toBe('"A \\"quoted\\" name"');
    expect(mocks.store.get(prop('passMark'))).toBe('0');
    expect(mocks.store.get(prop('enabled'))).toBe('false');
    expect(mocks.store.get(prop('quiet'))).toBe('true');

    const reader = setup({}, { properties: Object.fromEntries(mocks.store) });
    expect(reader.config.get('org')).toBe('A "quoted" name');
    expect(reader.config.get('passMark')).toBe(0);
    expect(reader.config.get('enabled')).toBe(false);
    expect(reader.config.get('quiet')).toBe(true);
    expect(reader.config.get('closesOn')).toBe('2026-12-31');
  });

  it('serves the saved values from the refreshed cache', () => {
    const { config, mocks } = setup();

    config.get('org');
    config._saveChanges(request({ org: 'Acme' }));

    expect(config.get('org')).toBe('Acme');
    expect(config._readSnapshot().version).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(mocks.properties.getProperties).toHaveBeenCalledTimes(2);
  });

  it('chains saves using the returned version', () => {
    const { config } = setup();

    const first = applied(config._saveChanges(request({ org: 'A' })));
    const second = applied(
      config._saveChanges(request({ org: 'B' }, first.version)),
    );

    expect(second.version).not.toBe(first.version);
    expect(second.changed).toEqual([{ key: 'org', from: 'A', to: 'B' }]);
  });

  it('only writes keys whose value changed', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"A"', [prop('passMark')]: '80' } },
    );

    const outcome = applied(
      config._saveChanges(request({ org: 'A', passMark: 90 })),
    );
    const written = mocks.properties.setProperties.mock.calls[0]?.[0] ?? {};

    expect(Object.keys(written).sort()).toEqual(
      [prop('passMark'), prop('__version'), prop('__saveId')].sort(),
    );
    expect(outcome.changed).toEqual([{ key: 'passMark', from: 80, to: 90 }]);
  });

  it('leaves the version alone when nothing changes', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"A"', [prop('__version')]: 'v1' } },
    );

    const outcome = applied(config._saveChanges(request({ org: 'A' }, 'v1')));

    expect(outcome.version).toBe('v1');
    expect(outcome.changed).toEqual([]);
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(mocks.Utilities.getUuid).not.toHaveBeenCalled();
  });

  it('never touches keys it was not asked to change', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"A"', [prop('locale')]: '"pt-BR"' } },
    );

    config._saveChanges(request({ passMark: 50 }));

    expect(mocks.store.get(prop('org'))).toBe('"A"');
    expect(mocks.store.get(prop('locale'))).toBe('"pt-BR"');
  });

  it('rewrites a stored value that was invalid', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('passMark')]: 'junk{' } },
    );

    config._saveChanges(request({ passMark: 70 }));

    expect(mocks.store.get(prop('passMark'))).toBe('70');
  });
});

describe('save: clearing a value', () => {
  it('stores JSON null so the default applies again', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('passMark')]: '90', [prop('org')]: '"A"' } },
    );

    const outcome = applied(config._saveChanges(request({ passMark: null })));

    expect(mocks.store.get(prop('passMark'))).toBe('null');
    expect(mocks.store.get(prop('org'))).toBe('"A"');
    expect(outcome.values.passMark).toBe(70);
    expect(outcome.changed).toEqual([{ key: 'passMark', from: 90, to: 70 }]);
    expect(config.get('passMark')).toBe(70);
  });

  it('treats an empty string like null', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('notes')]: '"x"' } },
    );

    config._saveChanges(request({ notes: '' }));

    expect(mocks.store.get(prop('notes'))).toBe('null');
  });

  it('skips clearing a key that is not stored or already cleared', () => {
    const { config, mocks } = setup();

    const outcome = applied(config._saveChanges(request({ notes: null })));

    expect(mocks.properties.deleteProperty).not.toHaveBeenCalled();
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(outcome.changed).toEqual([]);
  });

  it('never uses deleteProperty, so every save is one atomic write', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('notes')]: '"x"', [prop('org')]: '"A"' } },
    );

    config._saveChanges(request({ notes: null, org: 'B' }));

    expect(mocks.properties.deleteProperty).not.toHaveBeenCalled();
    expect(mocks.properties.setProperties).toHaveBeenCalledTimes(1);

    const again = config._saveChanges(
      request({ notes: null }, config._readSnapshot().version),
    );
    expect(applied(again).changed).toEqual([]);
    expect(mocks.properties.setProperties).toHaveBeenCalledTimes(1);
  });
});

describe('save: conflict', () => {
  it('rejects a version that is not the stored one', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('__version')]: 'v2', [prop('org')]: '"A"' } },
    );

    const outcome = config._saveChanges(request({ org: 'B' }, 'v1'));

    expect(outcome).toEqual({ ok: false, reason: 'conflict', version: 'v2' });
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(mocks.store.get(prop('org'))).toBe('"A"');
  });

  it('accepts the empty version before anything has been saved', () => {
    const { config } = setup();

    expect(config._saveChanges(request({ org: 'A' }, '')).ok).toBe(true);
  });

  it('rejects the empty version once something has been saved', () => {
    const { config } = setup();
    const first = applied(config._saveChanges(request({ org: 'A' })));

    expect(config._saveChanges(request({ org: 'B' }, '')).ok).toBe(false);
    expect(config._saveChanges(request({ org: 'B' }, first.version)).ok).toBe(
      true,
    );
  });

  it('detects a write by another execution after the cache was filled', () => {
    const { config, mocks } = setup();
    config.get('org');

    mocks.store.set(prop('org'), '"Other"');
    mocks.store.set(prop('__version'), 'theirs');

    expect(config._saveChanges(request({ org: 'Mine' }, ''))).toEqual({
      ok: false,
      reason: 'conflict',
      version: 'theirs',
    });
    expect(mocks.store.get(prop('org'))).toBe('"Other"');
  });
});

describe('save: replay', () => {
  it('returns the stored success for a repeated saveId without writing', () => {
    const { config, mocks } = setup();
    const first = applied(config._saveChanges(request({ org: 'A' }, '', 's1')));
    mocks.properties.setProperties.mockClear();
    mocks.Utilities.getUuid.mockClear();

    const replay = applied(
      config._saveChanges(request({ org: 'A' }, '', 's1')),
    );

    expect(replay.version).toBe(first.version);
    expect(replay.values).toEqual(first.values);
    expect(replay.changed).toEqual([]);
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(mocks.Utilities.getUuid).not.toHaveBeenCalled();
  });

  it('replays instead of reporting a false conflict', () => {
    const { config } = setup();
    const first = applied(config._saveChanges(request({ org: 'A' }, '', 's1')));

    const replay = config._saveChanges(request({ org: 'A' }, '', 's1'));

    expect(replay).toMatchObject({ ok: true, version: first.version });
  });

  it('replays for a new instance, as a retry comes from a new execution', () => {
    const first = setup();
    first.config._saveChanges(request({ org: 'A' }, '', 's1'));

    const retry = setup(
      {},
      { properties: Object.fromEntries(first.mocks.store) },
    );

    expect(
      retry.config._saveChanges(request({ org: 'A' }, '', 's1')),
    ).toMatchObject({ ok: true, changed: [] });
    expect(retry.mocks.properties.setProperties).not.toHaveBeenCalled();
  });

  it('applies a different saveId against the new version', () => {
    const { config } = setup();
    const first = applied(config._saveChanges(request({ org: 'A' }, '', 's1')));

    const second = applied(
      config._saveChanges(request({ org: 'B' }, first.version, 's2')),
    );

    expect(second.changed).toEqual([{ key: 'org', from: 'A', to: 'B' }]);
  });
});

describe('save: invalid', () => {
  it('reports declarative failures per key and writes nothing', () => {
    const { config, mocks } = setup();

    const outcome = config._saveChanges(
      request({
        passMark: 101,
        org: null,
        locale: 'fr-FR',
        site: 'http://example.org',
        notes: 'x'.repeat(21),
        closesOn: '2026-02-30',
      }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: 'invalid',
      errors: {
        passMark: 'Enter a value of at most 100',
        org: 'This field is required',
        locale: 'Choose one of the options',
        site: 'Enter a link starting with https://',
        notes: 'Use 20 characters or fewer',
        closesOn: 'Enter a valid date',
      },
    });
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
  });

  it('writes none of the changes when one is invalid', () => {
    const { config, mocks } = setup();

    config._saveChanges(request({ org: 'Fine', passMark: 'x' as never }));

    expect(mocks.store.size).toBe(0);
  });

  it('rejects values of the wrong type', () => {
    const { config } = setup();

    const outcome = config._saveChanges(
      request({
        passMark: '80' as never,
        enabled: 'yes' as never,
        org: 5 as never,
      }),
    );

    expect(outcome).toMatchObject({
      reason: 'invalid',
      errors: {
        passMark: 'Enter a number',
        enabled: 'Enter a valid value',
        org: 'Enter a valid value',
      },
    });
  });

  it('rejects a null boolean', () => {
    const { config } = setup();

    expect(config._saveChanges(request({ enabled: null }))).toMatchObject({
      reason: 'invalid',
      errors: { enabled: 'Enter a valid value' },
    });
  });

  it('rejects NaN and Infinity', () => {
    const { config } = setup();

    expect(
      config._saveChanges(request({ passMark: NaN, notes: null })),
    ).toMatchObject({ errors: { passMark: 'Enter a number' } });
    expect(config._saveChanges(request({ passMark: Infinity }))).toMatchObject({
      errors: { passMark: 'Enter a number' },
    });
  });

  it('runs the server validate for values that pass the declarative rules', () => {
    const validate = vi.fn((value: string) =>
      value.endsWith('/edit') ? null : 'This form could not be opened.',
    );
    const { config, mocks } = setup({
      schema: {
        form: { type: 'url', label: 'Form', maxLength: 40, validate },
      },
    });

    expect(
      config._saveChanges(request({ form: 'https://example.org/view' })),
    ).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { form: 'This form could not be opened.' },
    });
    expect(validate).toHaveBeenCalledWith('https://example.org/view');
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();

    expect(
      config._saveChanges(request({ form: 'https://example.org/edit' })).ok,
    ).toBe(true);
  });

  it('skips the server validate for empty values and declarative failures', () => {
    const validate = vi.fn(() => 'server says no');
    const { config } = setup({
      schema: {
        a: { type: 'string', label: 'A', maxLength: 3, validate },
        b: { type: 'number', label: 'B', validate },
      },
    });

    const outcome = config._saveChanges(request({ a: 'too long', b: null }));

    expect(outcome).toMatchObject({
      errors: { a: 'Use 3 characters or fewer' },
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it('merges declarative and server errors for different keys', () => {
    const { config } = setup({
      schema: {
        a: { type: 'number', label: 'A', max: 1 },
        b: { type: 'string', label: 'B', validate: () => 'Nope' },
      },
    });

    expect(config._saveChanges(request({ a: 2, b: 'x' }))).toMatchObject({
      errors: { a: 'Enter a value of at most 1', b: 'Nope' },
    });
  });
});

describe('save: malformed requests', () => {
  it('throws a validation error for a key that is not in the schema', () => {
    const { config, mocks } = setup();

    let thrown: unknown;
    try {
      config._saveChanges(request({ org: 'A', nope: 'x' }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      message: '[GasConfig] Unknown config key: nope',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: { key: 'nope' },
    });
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
  });

  it.each(['__version', '__saveId', '__proto__'])(
    'cannot reach the internal key %s',
    (key) => {
      const { config, mocks } = setup();
      const changes = JSON.parse(`{"${key}": "x"}`);

      expect(() => config._saveChanges(request(changes))).toThrow(
        /^\[GasConfig\] Unknown config key/,
      );
      expect(mocks.store.size).toBe(0);
    },
  );

  it.each([
    [null, /expected an object with "changes"/],
    [{ version: '', saveId: 's' }, /expected an object with "changes"/],
    [{ changes: [], version: '', saveId: 's' }, /expected an object/],
    [{ changes: {}, saveId: 's' }, /"version" must be a string/],
    [{ changes: {}, version: 1, saveId: 's' }, /"version" must be a string/],
    [{ changes: {}, version: '' }, /"saveId" must be a non-empty string/],
    [{ changes: {}, version: '', saveId: '' }, /"saveId" must be a non-empty/],
  ])('throws a validation error for the request %j', (body, message) => {
    const { config } = setup();

    expect(() => config._saveChanges(body as never)).toThrow(message);
    expect(() => config._saveChanges(body as never)).toThrow(/^\[GasConfig\]/);
  });
});

describe('save: write failure', () => {
  it('leaves every property and the cache untouched when setProperties throws', () => {
    const { config, mocks } = setup(
      {},
      {
        properties: {
          [prop('org')]: '"Before"',
          [prop('notes')]: '"x"',
          [prop('__version')]: 'v1',
        },
      },
    );
    config.getAll();
    const before = Object.fromEntries(mocks.store);
    mocks.properties.setProperties.mockImplementationOnce(() => {
      throw new Error(PROPERTIES_WRITE_FAILURE);
    });

    expect(() =>
      config._saveChanges(request({ org: 'After', notes: null }, 'v1')),
    ).toThrow(PROPERTIES_WRITE_FAILURE);

    expect(Object.fromEntries(mocks.store)).toEqual(before);
    expect(config.get('org')).toBe('Before');
    expect(config.get('notes')).toBe('x');
    expect(config._readSnapshot().version).toBe('v1');
  });

  it('leaves the cache as it was and the version unchanged', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"Before"' } },
    );
    expect(config.get('org')).toBe('Before');

    mocks.state.failWrites = true;
    expect(() => config._saveChanges(request({ org: 'After' }))).toThrow(
      PROPERTIES_WRITE_FAILURE,
    );

    expect(config.get('org')).toBe('Before');
    expect(config._readSnapshot().version).toBe('');
    expect(mocks.store.get(prop('org'))).toBe('"Before"');
  });

  it('does not store the saveId, so a retry applies instead of replaying', () => {
    const { config, mocks } = setup();

    mocks.state.failWrites = true;
    expect(() =>
      config._saveChanges(request({ org: 'A' }, '', 's1')),
    ).toThrow();
    mocks.state.failWrites = false;

    const retry = config._saveChanges(request({ org: 'A' }, '', 's1'));

    expect(retry).toMatchObject({
      ok: true,
      changed: [{ key: 'org', from: null, to: 'A' }],
    });
    expect(mocks.store.get(prop('org'))).toBe('"A"');
  });

  it('releases the lock', () => {
    const { config, mocks } = setup();

    mocks.state.failWrites = true;
    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow();

    expect(mocks.isLocked()).toBe(false);
  });
});

describe('save: stale cache', () => {
  it('never overwrites another key with a stale cached value', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: '"Old"', [prop('locale')]: '"en-GB"' } },
    );
    expect(config.get('locale')).toBe('en-GB');

    mocks.store.set(prop('locale'), '"pt-BR"');
    mocks.store.set(prop('__version'), 'v9');
    config._saveChanges(request({ org: 'New' }, 'v9'));

    expect(mocks.store.get(prop('locale'))).toBe('"pt-BR"');
    expect(config.get('locale')).toBe('pt-BR');
    expect(config.get('org')).toBe('New');
  });

  it('re-reads the properties under the lock, ignoring the cache', () => {
    const { config, mocks } = setup();
    config.get('org');
    mocks.reads.length = 0;

    config._saveChanges(request({ org: 'A' }));

    expect(mocks.reads).toEqual([true]);
  });
});
