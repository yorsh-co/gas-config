import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  GasConfigRpc: typeof GasConfigRpc;
  /** The script's global object, where function declarations land. */
  globalThis: Record<string, unknown>;
}

const load = createGasLoader<Exports>({
  files: SOURCE_FILES,
  exports: [
    'GasConfig',
    'GasConfigValidation',
    'GasConfigError',
    '_GasConfigErrors',
    'GasConfigRpc',
    'globalThis',
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
  const {
    PropertiesService,
    LockService,
    Session,
    Utilities,
    HtmlService,
    console,
  } = mocks;

  return {
    ...load({
      PropertiesService,
      LockService,
      Session,
      Utilities,
      HtmlService,
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

const PAGE_FILE = 'src/generated/gas-config.ui.html.ts';

/**
 * Like `loadGasConfig`, with the generated page constant replaced by `html`,
 * as after a build mismatch.
 */
export function loadGasConfigWithPage(
  html: string,
  options: MockOptions = {},
): Exports & { mocks: Mocks } {
  const directory = mkdtempSync(join(tmpdir(), 'gas-config-'));
  try {
    const page = join(directory, 'page.ts');
    writeFileSync(
      page,
      `const _GAS_CONFIG_UI_HTML: string = ${JSON.stringify(html)};`,
    );
    const mocks = createMocks(options);
    const { PropertiesService, LockService, Session, Utilities, HtmlService } =
      mocks;

    const exports = createGasLoader<Exports>({
      files: SOURCE_FILES.map((file) => (file === PAGE_FILE ? page : file)),
      exports: ['GasConfig'],
      root: ROOT,
    })({
      PropertiesService,
      LockService,
      Session,
      Utilities,
      HtmlService,
      console: mocks.console,
      Error,
      Date,
    });
    return { ...exports, mocks };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
