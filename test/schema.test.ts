import { describe, expect, it } from 'vitest';
import { loadGasConfig } from './harness';
import { SCHEMA, setup } from './helpers';

const { GasConfig } = loadGasConfig();

/** Constructs a GasConfig over a single field, as an untyped schema. */
function build(definition: unknown, key = 'k', options: object = {}) {
  return new GasConfig({
    schema: { [key]: definition } as unknown as GasConfigSchema,
    ...options,
  });
}

/** Asserts the construction throws a plain Error with a [GasConfig] message. */
function rejects(run: () => unknown, message: string | RegExp): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).constructor).toBe(Error);
  expect((thrown as Error).message).toMatch(/^\[GasConfig\] /);
  expect((thrown as Error).message).toMatch(message);
}

describe('schema validation: keys', () => {
  it.each(['a', 'A1', 'org.name', 'scoring.pass-mark', 'a_b'])(
    'accepts the key %s',
    (key) => {
      expect(() => build({ type: 'string', label: 'L' }, key)).not.toThrow();
    },
  );

  it.each(['__version', '_x', '1a', '.a', '-a', 'a b', 'a:b', 'a/b', ''])(
    'rejects the key %j',
    (key) => {
      rejects(
        () => build({ type: 'string', label: 'L' }, key),
        /Invalid config key/,
      );
    },
  );

  it('rejects a schema that is not an object', () => {
    rejects(
      () => new GasConfig({ schema: null as unknown as GasConfigSchema }),
      /Invalid "schema"/,
    );
    rejects(
      () => new GasConfig({ schema: [] as unknown as GasConfigSchema }),
      /Invalid "schema"/,
    );
  });

  it('rejects options that are not an object', () => {
    rejects(
      () => new GasConfig(undefined as unknown as GasConfigOptions),
      /Invalid options/,
    );
  });

  it('rejects a field that is not an object', () => {
    rejects(
      () => build('string'),
      /Invalid field "k": expected a field object/,
    );
    rejects(() => build(null), /expected a field object/);
  });
});

describe('schema validation: common keys', () => {
  it('rejects an unknown type', () => {
    rejects(
      () => build({ type: 'email', label: 'L' }),
      /Invalid field "k": unknown type "email"/,
    );
    rejects(() => build({ label: 'L' }), /unknown type "undefined"/);
  });

  it.each([undefined, '', '  ', 5])('rejects the label %j', (label) => {
    rejects(
      () => build({ type: 'string', label }),
      /Invalid field "k": "label" is required/,
    );
  });

  it('rejects a non-boolean required', () => {
    rejects(
      () => build({ type: 'string', label: 'L', required: 'yes' }),
      /"required" must be a boolean/,
    );
  });

  it('rejects non-string description and placeholder', () => {
    rejects(
      () => build({ type: 'string', label: 'L', description: 5 }),
      /"description" must be a string/,
    );
    rejects(
      () => build({ type: 'string', label: 'L', placeholder: {} }),
      /"placeholder" must be a string/,
    );
  });

  it('rejects a non-function validate', () => {
    rejects(
      () => build({ type: 'string', label: 'L', validate: 'nope' }),
      /"validate" must be a function/,
    );
  });
});

describe('schema validation: groups', () => {
  const groups = [{ id: 'general', label: 'General' }];

  it('accepts a field in a defined group', () => {
    expect(() =>
      build({ type: 'string', label: 'L', group: 'general' }, 'k', { groups }),
    ).not.toThrow();
  });

  it('rejects a group that is not defined', () => {
    rejects(
      () =>
        build({ type: 'string', label: 'L', group: 'other' }, 'k', { groups }),
      /"group" references the undefined group "other"/,
    );
  });

  it('rejects a group reference when there are no groups', () => {
    rejects(
      () => build({ type: 'string', label: 'L', group: 'general' }),
      /undefined group "general"/,
    );
  });

  it('rejects duplicate group ids', () => {
    rejects(
      () =>
        build({ type: 'string', label: 'L' }, 'k', {
          groups: [...groups, { id: 'general', label: 'Again' }],
        }),
      /duplicate group id "general"/,
    );
  });

  it('rejects malformed groups', () => {
    const field = { type: 'string', label: 'L' };

    rejects(() => build(field, 'k', { groups: 'x' }), /Invalid "groups"/);
    rejects(() => build(field, 'k', { groups: [null] }), /Invalid "groups"/);
    rejects(
      () => build(field, 'k', { groups: [{ label: 'No id' }] }),
      /groups\[\]\.id/,
    );
    rejects(
      () => build(field, 'k', { groups: [{ id: 'a' }] }),
      /groups\["a"\]\.label/,
    );
  });

  it('copies the groups', () => {
    const source = [{ id: 'g', label: 'G', description: 'D' }];
    const config = build({ type: 'string', label: 'L' }, 'k', {
      groups: source,
    });

    expect(config.groups).toEqual(source);
    expect(config.groups[0]).not.toBe(source[0]);
  });
});

describe('schema validation: select', () => {
  const select = (options: unknown) => ({
    type: 'select',
    label: 'L',
    options,
  });

  it('accepts options', () => {
    expect(() => build(select([{ value: 'a', label: 'A' }]))).not.toThrow();
  });

  it.each([undefined, [], 'a'])('rejects the options %j', (options) => {
    rejects(() => build(select(options)), /needs a non-empty "options" array/);
  });

  it.each([
    null,
    {},
    { value: 'a' },
    { value: '', label: 'E' },
    { value: 1, label: 'N' },
  ])('rejects the option %j', (option) => {
    rejects(() => build(select([option])), /every option needs/);
  });

  it('rejects duplicate option values', () => {
    rejects(
      () =>
        build(
          select([
            { value: 'a', label: 'A' },
            { value: 'a', label: 'Again' },
          ]),
        ),
      /duplicate option value "a"/,
    );
  });
});

describe('schema validation: rules', () => {
  it('rejects min greater than max', () => {
    rejects(
      () => build({ type: 'number', label: 'L', min: 5, max: 1 }),
      /"min" must not be greater than "max"/,
    );
  });

  it('accepts min equal to max', () => {
    expect(() =>
      build({ type: 'number', label: 'L', min: 5, max: 5 }),
    ).not.toThrow();
  });

  it.each([NaN, Infinity, '1'])('rejects a min of %j', (min) => {
    rejects(
      () => build({ type: 'number', label: 'L', min }),
      /"min" must be a finite number/,
    );
  });

  it('rejects a non-finite max and a non-boolean integer', () => {
    rejects(
      () => build({ type: 'number', label: 'L', max: Infinity }),
      /"max" must be a finite number/,
    );
    rejects(
      () => build({ type: 'number', label: 'L', integer: 1 }),
      /"integer" must be a boolean/,
    );
  });

  it.each([-1, 1.5, NaN, '3'])('rejects a maxLength of %j', (maxLength) => {
    rejects(
      () => build({ type: 'text', label: 'L', maxLength }),
      /"maxLength" must be a non-negative integer/,
    );
  });

  it('accepts a maxLength of zero', () => {
    expect(() =>
      build({ type: 'text', label: 'L', maxLength: 0 }),
    ).not.toThrow();
  });

  it('rejects a pattern that does not compile', () => {
    rejects(
      () => build({ type: 'string', label: 'L', pattern: '(' }),
      /"pattern" is not a valid regular expression/,
    );
  });

  it('rejects a non-string pattern and patternMessage', () => {
    rejects(
      () => build({ type: 'string', label: 'L', pattern: /a/ }),
      /"pattern" must be a string/,
    );
    rejects(
      () => build({ type: 'string', label: 'L', patternMessage: 1 }),
      /"patternMessage" must be a string/,
    );
  });
});

describe('schema validation: defaults', () => {
  it.each([
    ['string', 5],
    ['text', true],
    ['number', 'x'],
    ['number', NaN],
    ['url', 'http://example.org'],
    ['select', 'zz'],
    ['date', '2026-02-30'],
  ] as const)('rejects a %s default of %j', (type, value) => {
    rejects(
      () =>
        build({
          type,
          label: 'L',
          default: value,
          options: [{ value: 'a', label: 'A' }],
        }),
      /Invalid field "k": "default" is invalid/,
    );
  });

  it('rejects a default that fails the declarative rules', () => {
    rejects(
      () => build({ type: 'number', label: 'L', default: 11, max: 10 }),
      /"default" is invalid: Enter a value of at most 10/,
    );
    rejects(
      () => build({ type: 'text', label: 'L', default: 'abcd', maxLength: 3 }),
      /"default" is invalid: Use 3 characters or fewer/,
    );
    rejects(
      () =>
        build({
          type: 'string',
          label: 'L',
          default: 'abc',
          pattern: '^\\d+$',
          patternMessage: 'Digits only',
        }),
      /"default" is invalid: Digits only/,
    );
  });

  it('rejects a boolean default that is not a boolean', () => {
    rejects(
      () => build({ type: 'boolean', label: 'L', default: 'true' }),
      /"default" must be a boolean/,
    );
    rejects(
      () => build({ type: 'boolean', label: 'L', default: null }),
      /"default" must be a boolean/,
    );
  });

  it('does not put the rejected value in the message', () => {
    rejects(
      () => build({ type: 'number', label: 'L', default: 'secret-value' }),
      /^(?![\s\S]*secret-value)/,
    );
  });

  it('allows a required field with an empty default', () => {
    expect(() =>
      build({ type: 'string', label: 'L', required: true, default: '' }),
    ).not.toThrow();
    expect(() =>
      build({ type: 'number', label: 'L', required: true, default: null }),
    ).not.toThrow();
    expect(() =>
      build({ type: 'url', label: 'L', required: true }),
    ).not.toThrow();
  });

  it('allows an optional field of every type to omit its default', () => {
    for (const type of ['string', 'text', 'url', 'number', 'date'] as const) {
      expect(() => build({ type, label: 'L' })).not.toThrow();
    }
    expect(() =>
      build({
        type: 'select',
        label: 'L',
        options: [{ value: 'a', label: 'A' }],
      }),
    ).not.toThrow();
  });

  it('does not run the server-only validate on the default', () => {
    let calls = 0;
    build({
      type: 'string',
      label: 'L',
      default: 'x',
      validate: () => {
        calls += 1;
        return 'never';
      },
    });

    expect(calls).toBe(0);
  });
});

describe('schema validation: options', () => {
  it('rejects a bad title and description', () => {
    const field = { type: 'string', label: 'L' };

    rejects(() => build(field, 'k', { title: '' }), /Invalid "title"/);
    rejects(
      () => build(field, 'k', { description: 5 }),
      /Invalid "description"/,
    );
  });

  it('rejects malformed editors', () => {
    const field = { type: 'string', label: 'L' };

    rejects(() => build(field, 'k', { editors: 'a@b.c' }), /Invalid "editors"/);
    rejects(() => build(field, 'k', { editors: [''] }), /Invalid "editors"/);
  });

  it('defaults and stores the options', () => {
    const field = { type: 'string', label: 'L' };
    const defaults = build(field);
    const given = build(field, 'k', {
      title: 'Setup',
      description: 'About',
      editors: ['a@example.org'],
    });

    expect(defaults.title).toBe('Settings');
    expect(defaults.description).toBeUndefined();
    expect(defaults.editors).toEqual([]);
    expect(defaults.groups).toEqual([]);
    expect(given.title).toBe('Setup');
    expect(given.description).toBe('About');
    expect(given.editors).toEqual(['a@example.org']);
  });
});

describe('client fields', () => {
  it('converts the schema to the shape the UI receives', () => {
    const { config } = setup();
    const byKey = Object.fromEntries(
      config._clientFields.map((field) => [field.key, field]),
    );

    expect(config._clientFields.map((field) => field.key)).toEqual(
      Object.keys(SCHEMA),
    );
    expect(byKey.org).toEqual({
      key: 'org',
      type: 'string',
      label: 'Organisation',
      required: true,
      default: null,
    });
    expect(byKey.passMark).toEqual({
      key: 'passMark',
      type: 'number',
      label: 'Pass mark',
      required: false,
      default: 70,
      rules: { integer: true, min: 0, max: 100 },
    });
    expect(byKey.locale?.options).toEqual([
      { value: 'en-GB', label: 'English' },
      { value: 'pt-BR', label: 'Portuguese' },
    ]);
    expect(byKey.enabled?.default).toBe(true);
    expect(byKey.quiet?.default).toBe(false);
  });

  it('never exposes the server-only validate', () => {
    const config = build({
      type: 'string',
      label: 'L',
      validate: () => null,
    });

    expect(JSON.stringify(config._clientFields)).not.toContain('validate');
  });

  it('is unaffected by later changes to the schema object', () => {
    const schema = { k: { type: 'string', label: 'L', default: 'a' } };
    const config = new GasConfig({ schema: schema as GasConfigSchema });

    schema.k.default = 'b';
    schema.k.label = 'Changed';

    expect(config._clientFields[0]?.default).toBe('a');
    expect(config._clientFields[0]?.label).toBe('L');
  });
});
