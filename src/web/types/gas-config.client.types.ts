/**
 * Browser-side declarations: the slice of `google.script` the UI uses, and the
 * shape of the RPC client.
 */

/** Chainable runner of `google.script.run`, reduced to what the UI calls. */
interface GasConfigScriptRun {
  withSuccessHandler(callback: (value: unknown) => void): GasConfigScriptRun;
  withFailureHandler(callback: (error: unknown) => void): GasConfigScriptRun;
  GasConfigRpc(method: string, payload?: unknown): void;
}

/** Injected by HtmlService in production and by `dev/mock-server.js` locally. */
declare const google: {
  script: {
    run: GasConfigScriptRun;
    host: { close(): void };
  };
};

/** Options of a single RPC call. */
interface GasConfigRpcCallOptions {
  /** Client-side deadline; the server keeps running past it. @default 30000 */
  timeoutMs?: number;
}

/** Rejection of every `GasConfigRpcClient` call. */
interface GasConfigRpcFailure extends Error {
  /** HTTP-like status from the envelope; `0` for client-side failures. */
  readonly status: number;
  /** Envelope code, `CLIENT_TIMEOUT` or `CLIENT_ERROR`. */
  readonly code: string;
  readonly details?: unknown;
}

/** The browser RPC client. */
interface GasConfigRpcClientApi {
  /** Code of the failure produced when a call outlives its deadline. */
  readonly TIMEOUT_CODE: 'CLIENT_TIMEOUT';
  /** Code of failures with no server envelope. */
  readonly CLIENT_ERROR_CODE: 'CLIENT_ERROR';
  readonly DEFAULT_TIMEOUT_MS: number;
  call<M extends GasConfigRpcMethod>(
    method: M,
    payload: GasConfigRpcMethods[M]['payload'],
    options?: GasConfigRpcCallOptions,
  ): Promise<GasConfigRpcMethods[M]['result']>;
  getSettings(
    options?: GasConfigRpcCallOptions,
  ): Promise<GasConfigSettingsState>;
  saveSettings(
    request: GasConfigSaveRequest,
    options?: GasConfigRpcCallOptions,
  ): Promise<GasConfigSaveResponse>;
  /** Parses the message of an error thrown by the server into a failure. */
  parseFailure(error: unknown): GasConfigRpcFailure;
}

/** The settings a page boots with, after merging bootstrap and query. */
interface GasConfigBootstrapResult {
  surface: GasConfigSurface;
  theme: GasConfigTheme;
  brand: NonNullable<GasConfigBootstrap['brand']>;
  state: GasConfigSettingsState | null;
}

interface GasConfigBootstrapReaderApi {
  /**
   * Reads the bootstrap JSON, with the `surface` and `theme` query parameters
   * as a fallback for what it lacks. Malformed JSON and unknown values are
   * ignored.
   */
  read(
    json: string | null | undefined,
    search: string,
  ): GasConfigBootstrapResult;
}
