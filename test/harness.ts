import { fileURLToPath } from 'node:url';
import { createGasLoader, loadOrderFiles } from 'gas-dev-config/test';
import { createMocks, type MockOptions, type Mocks } from './mocks';

/** Repository root, against which `SOURCE_FILES` resolve. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Source files in load order, from `gasDevConfig.loadOrder`. */
export const SOURCE_FILES = loadOrderFiles(ROOT);

interface Exports {
  GasConfig: typeof GasConfig;
  GasConfigValidation: typeof GasConfigValidation;
  GasConfigError: typeof GasConfigError;
  _GasConfigErrors: typeof _GasConfigErrors;
}

const load = createGasLoader<Exports>({
  files: SOURCE_FILES,
  exports: [
    'GasConfig',
    'GasConfigValidation',
    'GasConfigError',
    '_GasConfigErrors',
  ],
  root: ROOT,
});

/**
 * Evaluates the library sources in a fresh context wired to fake Apps Script
 * services, so each call is isolated from every other. `Error` and `Date` are
 * shared with the test realm, so thrown errors satisfy `instanceof` checks in
 * assertions. `globals` adds further context globals, such as the classes of
 * an optional peer library.
 */
export function loadGasConfig(
  options: MockOptions = {},
  globals: Record<string, unknown> = {},
): Exports & { mocks: Mocks } {
  const mocks = createMocks(options);
  const { PropertiesService, LockService, Session, Utilities, console } = mocks;

  return {
    ...load({
      PropertiesService,
      LockService,
      Session,
      Utilities,
      console,
      Error,
      Date,
      ...globals,
    }),
    mocks,
  };
}

/**
 * Evaluates the sources in a context with no globals beyond `Error` and
 * `Date`: no Apps Script service, no `console` and no `URL`. Proves what
 * runs there needs none of them.
 */
export function loadBare(): Exports {
  return load({ Error, Date });
}
