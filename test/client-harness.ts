import { fileURLToPath } from 'node:url';
import { createGasLoader } from 'gasdev/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Handlers the fake `google.script.run` hands to a dispatched call. */
export interface RunHandlers {
  success(value: unknown): void;
  failure(error: unknown): void;
}

/** What a fake `GasConfigRpc` call does once it is dispatched. */
export type RunBehavior = (
  call: { method: string; payload: unknown },
  handlers: RunHandlers,
) => void;

/** Loose, test-side view of the RPC client global. */
export interface RpcClientView {
  TIMEOUT_CODE: string;
  CLIENT_ERROR_CODE: string;
  DEFAULT_TIMEOUT_MS: number;
  getSettings(options?: { timeoutMs?: number }): Promise<unknown>;
  saveSettings(
    request: GasConfigSaveRequest,
    options?: { timeoutMs?: number },
  ): Promise<unknown>;
  parseFailure(error: unknown): Error;
}

/** Loose, test-side view of the bootstrap reader global. */
export interface BootstrapReaderView {
  read(json: string | null | undefined, search: string): unknown;
}

interface ClientExports {
  GasConfigRpcClient: RpcClientView;
  GasConfigBootstrapReader: BootstrapReaderView;
}

const load = createGasLoader<ClientExports>({
  files: ['src/web/gas-config.rpc.ts', 'src/web/gas-config.bootstrap.ts'],
  exports: ['GasConfigRpcClient', 'GasConfigBootstrapReader'],
  root: ROOT,
});

/**
 * Evaluates the browser client files in a fresh context with a fake
 * `google.script.run`: a chainable builder per access that hands each
 * `GasConfigRpc` call to `behavior`. `calls` records every call dispatched.
 */
export function loadClient(behavior: RunBehavior = () => undefined) {
  const calls: { method: string; payload: unknown }[] = [];

  const google = {
    script: {
      get run() {
        let success: RunHandlers['success'] = () => undefined;
        let failure: RunHandlers['failure'] = () => undefined;
        const run = {
          withSuccessHandler: (fn: typeof success) => ((success = fn), run),
          withFailureHandler: (fn: typeof failure) => ((failure = fn), run),
          GasConfigRpc: (method: string, payload: unknown) => {
            calls.push({ method, payload });
            behavior({ method, payload }, { success, failure });
          },
        };
        return run;
      },
    },
  };

  const exports = load({
    google,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Error,
  });

  return { ...exports, calls };
}
