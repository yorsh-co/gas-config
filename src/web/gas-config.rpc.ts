/**
 * Browser client for `GasConfigRpc`.
 *
 * Wraps `google.script.run` in promises with a per-call deadline. The server
 * reports failures by throwing `Error(JSON.stringify(envelope))`, which this
 * client parses into a `GasConfigRpcFailure` carrying `status` and `code`.
 * `google.script.run` has no cancel API: a timeout only stops the client
 * waiting, and the server call runs to completion.
 *
 * ```js
 * const state = await GasConfigRpcClient.getSettings();
 * ```
 */
const GasConfigRpcClient: GasConfigRpcClientApi = (() => {
  const TIMEOUT_CODE = 'CLIENT_TIMEOUT';
  const CLIENT_ERROR_CODE = 'CLIENT_ERROR';
  const DEFAULT_TIMEOUT_MS = 30000;
  const FALLBACK_MESSAGE = 'Something went wrong. Try again.';

  class RpcFailure extends Error implements GasConfigRpcFailure {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(
      message: string,
      status: number,
      code: string,
      details?: unknown,
    ) {
      super(message);
      this.name = 'GasConfigRpcFailure';
      this.status = status;
      this.code = code;
      if (details !== undefined) this.details = details;
    }
  }

  const isEnvelope = (value: unknown): value is GasConfigErrorEnvelope => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate['status'] === 'number' &&
      typeof candidate['code'] === 'string' &&
      typeof candidate['error'] === 'string'
    );
  };

  const messageOf = (error: unknown): string => {
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return '';
  };

  /**
   * Apps Script may prefix the message of a thrown error, so the JSON is
   * located rather than assumed to start at index 0.
   */
  const parseFailure = (error: unknown): GasConfigRpcFailure => {
    if (error instanceof RpcFailure) return error;

    const message = messageOf(error);
    const start = message.indexOf('{');

    if (start !== -1) {
      try {
        const envelope: unknown = JSON.parse(message.slice(start));
        if (isEnvelope(envelope)) {
          return new RpcFailure(
            envelope.error,
            envelope.status,
            envelope.code,
            envelope.details,
          );
        }
      } catch {
        // Not an envelope: reported as a client error below.
      }
    }
    return new RpcFailure(message || FALLBACK_MESSAGE, 0, CLIENT_ERROR_CODE);
  };

  const call = <M extends GasConfigRpcMethod>(
    method: M,
    payload: GasConfigRpcMethods[M]['payload'],
    options: GasConfigRpcCallOptions = {},
  ): Promise<GasConfigRpcMethods[M]['result']> =>
    new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let settled = false;

      const settle = (finish: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish();
      };

      const timer = setTimeout(
        () =>
          settle(() =>
            reject(
              new RpcFailure('The request timed out.', 504, TIMEOUT_CODE, {
                method,
                timeoutMs,
              }),
            ),
          ),
        timeoutMs,
      );

      // Dispatch can throw before any handler fires, for example when the
      // payload cannot be serialised.
      try {
        google.script.run
          .withSuccessHandler((value) =>
            settle(() => resolve(value as GasConfigRpcMethods[M]['result'])),
          )
          .withFailureHandler((error) =>
            settle(() => reject(parseFailure(error))),
          )
          .GasConfigRpc(method, payload);
      } catch (error) {
        settle(() => reject(parseFailure(error)));
      }
    });

  return Object.freeze({
    TIMEOUT_CODE,
    CLIENT_ERROR_CODE,
    DEFAULT_TIMEOUT_MS,
    call,
    getSettings: (options?: GasConfigRpcCallOptions) =>
      call('getSettings', undefined, options),
    saveSettings: (
      request: GasConfigSaveRequest,
      options?: GasConfigRpcCallOptions,
    ) => call('saveSettings', request, options),
    parseFailure,
  });
})();
