import { vi } from 'vitest';
import { loadGasConfig } from './harness';
import { DEFAULT_EMAIL, type MockOptions } from './mocks';

/** Spy logger satisfying `GasConfigLogger`. */
export function createLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

/**
 * Pass-through lock service that records its calls. `lockService` is what to
 * inject; `withLock` is the spy to assert on.
 */
export function createLockService() {
  const withLock = vi.fn(
    (scope: GasConfigLockScope, callback: () => unknown): unknown => {
      void scope;
      return callback();
    },
  );
  return { withLock, lockService: { withLock } as GasConfigLockService };
}

/** A schema covering every field type, for tests that need a bit of each. */
export const SCHEMA = {
  org: { type: 'string', label: 'Organisation', required: true, default: '' },
  site: { type: 'url', label: 'Site' },
  notes: { type: 'text', label: 'Notes', maxLength: 20 },
  passMark: {
    type: 'number',
    label: 'Pass mark',
    default: 70,
    integer: true,
    min: 0,
    max: 100,
  },
  locale: {
    type: 'select',
    label: 'Locale',
    default: 'en-GB',
    options: [
      { value: 'en-GB', label: 'English' },
      { value: 'pt-BR', label: 'Portuguese' },
    ],
  },
  closesOn: { type: 'date', label: 'Closes on' },
  enabled: { type: 'boolean', label: 'Enabled', default: true },
  quiet: { type: 'boolean', label: 'Quiet' },
} satisfies GasConfigSchema;

/** Property name a config key is stored under. */
export const prop = (key: string): string => `gasConfig:${key}`;

/**
 * Loads the library and a `GasConfig` over `SCHEMA`, with a spy logger and
 * the default signed-in user as its only editor.
 */
export function setup(
  options: Partial<GasConfigOptions> = {},
  mockOptions: MockOptions = {},
  globals: Record<string, unknown> = {},
) {
  const loaded = loadGasConfig(mockOptions, globals);
  const logger = createLogger();
  const config = new loaded.GasConfig({
    schema: SCHEMA as GasConfigSchema,
    logger,
    editors: [DEFAULT_EMAIL],
    ...options,
  });
  return { ...loaded, config, logger };
}

/** Builds a save request, with a fresh `saveId` unless given. */
let saveCounter = 0;
export function request(
  changes: Record<string, GasConfigValue>,
  version = '',
  saveId = `save-${++saveCounter}`,
): GasConfigSaveRequest {
  return { changes, version, saveId };
}
