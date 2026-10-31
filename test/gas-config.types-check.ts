/**
 * Compile-time checks for the schema and `get` typing. Not a vitest suite —
 * `tsc -p tsconfig.test.json` (`npm run typecheck`) compiles it, and an
 * unexpected error, or a missing `@ts-expect-error`, fails the build. Global
 * declarations come from `src/`.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

declare function expectType<T>(value: T): void;

const config = new GasConfig({
  schema: {
    name: { type: 'string', label: 'Name', required: true, default: '' },
    site: { type: 'url', label: 'Site' },
    notes: { type: 'text', label: 'Notes', maxLength: 10 },
    limit: {
      type: 'number',
      label: 'Limit',
      default: 5,
      min: 0,
      integer: true,
    },
    enabled: { type: 'boolean', label: 'Enabled', default: false },
    quiet: { type: 'boolean', label: 'Quiet' },
    locale: {
      type: 'select',
      label: 'Locale',
      default: 'en-GB',
      options: [{ value: 'en-GB', label: 'English' }],
    },
    closesOn: { type: 'date', label: 'Closes on', default: null },
  },
  groups: [{ id: 'general', label: 'General', description: 'Basics' }],
  editors: ['a@example.org'],
  title: 'Settings',
  description: 'About',
  logger: console,
  lockService: { withLock: (_scope, callback) => callback() },
  lockTimeoutMs: 1000,
});

// get() is typed by the field.
const name: string | null = config.get('name');
const limit: number | null = config.get('limit');
const closesOn: string | null = config.get('closesOn');
const locale: string | null = config.get('locale');

// Literal defaults widen: a boolean with `default: false` is `boolean`, and
// booleans are never null.
const enabled: boolean = config.get('enabled');
const quiet: boolean = config.get('quiet');

const limitIsNullable: Equal<
  ReturnType<typeof config.get<'limit'>>,
  number | null
> = true;
const enabledIsPlain: Equal<
  ReturnType<typeof config.get<'enabled'>>,
  boolean
> = true;

// @ts-expect-error a string is not a number
const notANumber: number = config.get('name');

// @ts-expect-error a nullable value is not a plain string
const notNullable: string = config.get('site');

// @ts-expect-error a boolean is not nullable
const noNullBoolean: null = config.get('enabled');

// @ts-expect-error unknown keys are type errors
config.get('missing');

// @ts-expect-error internal keys are not config keys
config.get('__version');

// getAll() is typed per key.
const all = config.getAll();
expectType<string | null>(all.name);
expectType<number | null>(all.limit);
expectType<boolean>(all.enabled);

// @ts-expect-error unknown keys are not part of the result
void all.missing;

// `type` constrains `default`.
new GasConfig({
  schema: {
    // @ts-expect-error a number default must be a number
    a: { type: 'number', label: 'A', default: 'x' },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error a boolean default cannot be null
    a: { type: 'boolean', label: 'A', default: null },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error a string default must be a string
    a: { type: 'text', label: 'A', default: 1 },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error a boolean default must be a boolean
    a: { type: 'boolean', label: 'A', default: 'true' },
  },
});

// Required keys of a type are enforced.
new GasConfig({
  schema: {
    // @ts-expect-error `options` is required for a select
    a: { type: 'select', label: 'A' },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error `label` is required
    a: { type: 'string' },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error unknown types are rejected
    a: { type: 'email', label: 'A' },
  },
});

// `validate` receives the value type of its field.
new GasConfig({
  schema: {
    a: {
      type: 'number',
      label: 'A',
      validate: (value) => (value > 0 ? null : 'Enter a positive number'),
    },
    b: {
      type: 'url',
      label: 'B',
      validate: (value) =>
        value.endsWith('/edit') ? null : 'Not an edit link',
    },
  },
});

new GasConfig({
  schema: {
    // @ts-expect-error a number validator cannot take a string
    a: {
      type: 'number',
      label: 'A',
      validate: (value: string) => value,
    },
  },
});

// The schema is required, and options are typed.
// @ts-expect-error `schema` is required
new GasConfig({});

new GasConfig({
  schema: {},
  // @ts-expect-error a logger needs info and warn
  logger: { info: () => undefined },
});

new GasConfig({
  schema: {},
  // @ts-expect-error lockTimeoutMs is a number
  lockTimeoutMs: '30000',
});

// The class defaults to an open schema, where any string key is allowed.
declare const open: GasConfig;
const anything: GasConfigValue = open.get('anything');

// Save requests and outcomes follow the contract.
declare const outcome: GasConfigSaveOutcome;
if (outcome.ok) {
  const changed: GasConfigChange[] = outcome.changed;
  const version: string = outcome.version;
  void [changed, version];
} else if (outcome.reason === 'invalid') {
  const errors: Record<string, string> = outcome.errors;
  void errors;
} else {
  const version: string = outcome.version;
  void version;
}

void [
  name,
  limit,
  closesOn,
  locale,
  enabled,
  quiet,
  limitIsNullable,
  enabledIsPlain,
  notANumber,
  notNullable,
  noNullBoolean,
  anything,
];
