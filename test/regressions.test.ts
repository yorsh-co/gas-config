import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './harness';
import { SCHEMA, prop, request, setup } from './helpers';

/**
 * One test per applicable item of "Lessons to carry into 2.0" in
 * docs/v2-plan.md. Items covered in depth elsewhere are checked here at the
 * level of the behaviour the lesson names.
 */

describe('lesson: a required entry may have an empty default', () => {
  it('constructs, reads as empty, and is invalid until filled', () => {
    const { config } = setup({
      schema: {
        name: { type: 'string', label: 'Name', required: true, default: '' },
        limit: { type: 'number', label: 'Limit', required: true },
      },
    });

    expect(config.getAll()).toEqual({ name: null, limit: null });
    expect(config._saveChanges(request({ name: null, limit: null }))).toEqual({
      ok: false,
      reason: 'invalid',
      errors: {
        name: 'This field is required',
        limit: 'This field is required',
      },
    });
    expect(config._saveChanges(request({ name: 'A', limit: 1 })).ok).toBe(true);
  });
});

describe('lesson: optional entries may be empty for every type', () => {
  it.each(['string', 'text', 'url', 'number', 'date', 'select'] as const)(
    'accepts null for an optional %s without a default',
    (type) => {
      const { config, mocks } = setup({
        schema: {
          k: { type, label: 'K', options: [{ value: 'a', label: 'A' }] },
        } as GasConfigSchema,
      });

      expect(config.get('k')).toBeNull();
      expect(config._saveChanges(request({ k: null })).ok).toBe(true);
      expect(mocks.store.has(prop('k'))).toBe(false);
    },
  );
});

describe('lesson: saving writes only the changed keys', () => {
  it('leaves keys another execution wrote alone, then restores the cache on failure', () => {
    const { config, mocks } = setup();
    config.getAll();
    mocks.store.set(prop('locale'), '"pt-BR"');

    config._saveChanges(request({ org: 'A' }));
    expect(mocks.store.get(prop('locale'))).toBe('"pt-BR"');

    mocks.state.failWrites = true;
    expect(() =>
      config._saveChanges(
        request({ org: 'B' }, config._readSnapshot().version),
      ),
    ).toThrow();
    expect(config.get('org')).toBe('A');
  });
});

describe('lesson: NaN and Infinity are not numbers', () => {
  it.each([NaN, Infinity, -Infinity])('rejects %j on save', (value) => {
    const { config } = setup();

    expect(config._saveChanges(request({ passMark: value }))).toMatchObject({
      reason: 'invalid',
      errors: { passMark: 'Enter a number' },
    });
  });

  it('rejects them as schema bounds and defaults', () => {
    const { GasConfig } = setup();

    expect(
      () =>
        new GasConfig({
          schema: { n: { type: 'number', label: 'N', max: Infinity } },
        }),
    ).toThrow(/finite number/);
    expect(
      () =>
        new GasConfig({
          schema: { n: { type: 'number', label: 'N', default: NaN } },
        }),
    ).toThrow(/"default" is invalid/);
  });
});

describe('lesson: get() throws on an unknown key and returns copies', () => {
  it('throws with the key', () => {
    const { config } = setup();

    expect(() => config.get('missing')).toThrow(
      '[GasConfig] Unknown config key: missing',
    );
  });

  it('returns a new object from getAll and read snapshots', () => {
    const { config } = setup();

    expect(config.getAll()).not.toBe(config.getAll());
    expect(config._readSnapshot().values).not.toBe(
      config._readSnapshot().values,
    );
  });
});

describe('lesson: one invalid value never makes the other keys unreadable', () => {
  it('reads every other key when several stored values are broken', () => {
    const { config } = setup(
      {},
      {
        properties: {
          [prop('passMark')]: '{',
          [prop('enabled')]: '"x"',
          [prop('org')]: '"Fine"',
        },
      },
    );

    expect(() => config.getAll()).not.toThrow();
    expect(config.get('org')).toBe('Fine');
  });
});

describe('lesson: errors carry the [GasConfig] prefix', () => {
  it('prefixes every message thrown by construction, reads and saves', () => {
    const { GasConfig, config } = setup();
    const attempts: Array<() => unknown> = [
      () => config.get('nope'),
      () => config._saveChanges(request({ nope: 1 })),
      () => config._saveChanges(null as never),
      () => new GasConfig({ schema: { '1': {} } as never }),
      () => new GasConfig({ schema: { a: {} } as never }),
      () => new GasConfig({ schema: SCHEMA, logger: 1 as never }),
      () => new GasConfig({ schema: SCHEMA, lockService: 1 as never }),
      () => new GasConfig({ schema: SCHEMA, lockTimeoutMs: -1 }),
      () => new GasConfig({ schema: SCHEMA, editors: 'x' as never }),
    ];

    for (const attempt of attempts) {
      expect(attempt).toThrow(/^\[GasConfig\] /);
    }
  });
});

describe('lesson: no work at construction', () => {
  it('is covered by read.test.ts and holds for every option', () => {
    const { GasConfig, mocks, logger } = setup();

    new GasConfig({
      schema: SCHEMA,
      groups: [{ id: 'g', label: 'G' }],
      editors: ['a@example.org'],
      title: 'T',
      description: 'D',
      logger,
      lockTimeoutMs: 100,
    });

    expect(mocks.PropertiesService.getScriptProperties).not.toHaveBeenCalled();
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('lesson: Apps Script sources have no async or await (P8)', () => {
  const sources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(directory, entry.name))
        : entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
          ? [join(directory, entry.name)]
          : [],
    );

  it.each(sources(join(ROOT, 'src')))('%s has none', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\b(async|await)\b/);
  });
});

describe('lesson: Date and undefined do not survive google.script.run', () => {
  it('keeps every value that crosses the wire JSON-safe', () => {
    const { config } = setup();
    const saved = config._saveChanges(
      request({ org: 'A', closesOn: '2026-12-31', notes: null }),
    );
    const wire = {
      fields: config._clientFields,
      values: config.getAll(),
      saved: saved.ok
        ? { ok: true, values: saved.values, version: saved.version }
        : saved,
    };

    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
    expect(JSON.stringify(wire)).not.toContain('undefined');
    expect(Object.values(config.getAll()).every((v) => v !== undefined)).toBe(
      true,
    );
  });
});

describe('lesson: optional peers fail only at runtime when absent (P7)', () => {
  it('works with no GasLock, gas-error or GasLogger loaded', () => {
    const { config, mocks } = setup({ logger: undefined as never }, {});

    expect(() => config.getAll()).not.toThrow();
    expect(config._saveChanges(request({ org: 'A' })).ok).toBe(true);
    expect(mocks.console.warn).not.toHaveBeenCalled();
  });
});
