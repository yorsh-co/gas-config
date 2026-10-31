import { fileURLToPath } from 'node:url';
import { createGasLoader, loadOrderFiles } from 'gas-dev-config/test';

/** Repository root, against which `SOURCE_FILES` resolve. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Source files in load order, from `gasDevConfig.loadOrder`. */
export const SOURCE_FILES = loadOrderFiles(ROOT);

const load = createGasLoader<{ GasConfig: typeof GasConfig }>({
  files: SOURCE_FILES,
  exports: ['GasConfig'],
  root: ROOT,
});

/**
 * Evaluates the library sources in a fresh context with a minimal
 * `GasSheetDb` stub, so each call is isolated from every other.
 */
export function loadGasConfig(): { GasConfig: typeof GasConfig } {
  class GasSheetDb {}
  return load({ GasSheetDb, console, Error, Date });
}
