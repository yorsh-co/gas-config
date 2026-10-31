/**
 * The server side of the settings UI: the dialog, sidebar and page hosts, and
 * `GasConfigRpc`, the one entry point the browser calls.
 *
 * Nothing in the shipped code may name a document service such as the
 * spreadsheet, document, slides or form services. Apps Script derives a
 * project's OAuth scopes by scanning its code for service names, so naming one
 * would ask every consumer for all of their scopes. The caller passes its own
 * `Ui` instead; `test/scopes.test.ts` enforces this.
 */

/**
 * The element the generated page ships with, exactly as the contract in
 * `src/web/gas-config.ui.html` describes it.
 */
const _GAS_CONFIG_BOOTSTRAP_ELEMENT =
  '<script type="application/json" id="gas-config-bootstrap">{}</script>';

const _GAS_CONFIG_DIALOG_WIDTH = 600;
const _GAS_CONFIG_DIALOG_HEIGHT = 560;

/** HtmlService drops a literal viewport meta, so it is added on the output. */
const _GAS_CONFIG_VIEWPORT = 'width=device-width, initial-scale=1';

/** What the browser shows for a failure that is not the user's to fix. */
const _GAS_CONFIG_GENERIC_ERROR = 'Something went wrong. Try again.';

const _GAS_CONFIG_NO_INSTANCE =
  '[GasConfig] No GasConfig instance is registered. Declare it once, at global scope, so it exists in every execution.';

/** The instance `GasConfigRpc` routes to: the most recently constructed. */
const _gasConfigRpcTarget: { current: GasConfig | null } = { current: null };

/**
 * Methods added to `GasConfig` by `gas-config.ui.ts`, which is loaded after
 * the class. They merge into the class declaration and are installed on its
 * prototype below.
 */
interface GasConfig<S extends GasConfigSchema = GasConfigSchema> {
  /**
   * Opens the settings in a modal dialog. The caller passes the `Ui` of its
   * host document, so the library names no document service and asks for none
   * of their scopes.
   *
   * The menu handler must be a top-level function whose name does not end in
   * `_`, as Apps Script cannot call private functions from a menu.
   *
   * ```js
   * const config = new GasConfig({ schema, editors: ['admin@example.org'] });
   *
   * function onOpen() {
   *   SpreadsheetApp.getUi()
   *     .createMenu('Settings')
   *     .addItem('Open settings', 'openSettings')
   *     .addToUi();
   * }
   *
   * function openSettings() {
   *   config.showDialog(SpreadsheetApp.getUi());
   * }
   * ```
   *
   * Throws a `[GasConfig]` error for an invalid `ui` or option.
   */
  showDialog(
    ui: GoogleAppsScript.Base.Ui,
    options?: GasConfigDialogOptions,
  ): void;

  /**
   * Opens the settings in the sidebar of the host document. The caller passes
   * its own `Ui`, as in `showDialog`, and the menu handler is a top-level
   * function whose name does not end in `_`.
   *
   * ```js
   * function openSettings() {
   *   config.showSidebar(SpreadsheetApp.getUi());
   * }
   * ```
   *
   * Throws a `[GasConfig]` error for an invalid `ui` or option.
   */
  showSidebar(
    ui: GoogleAppsScript.Base.Ui,
    options?: GasConfigPageOptions,
  ): void;

  /**
   * Returns the settings as a full page, for a web app's `doGet`. Requires
   * "Execute as: User accessing the web app" and the `userinfo.email` scope,
   * as the signed-in user is checked against `editors`.
   *
   * ```js
   * function doGet() {
   *   return config.createHtmlOutput();
   * }
   * ```
   *
   * Throws a `[GasConfig]` error for an invalid option.
   */
  createHtmlOutput(
    options?: GasConfigPageOptions,
  ): GoogleAppsScript.HTML.HtmlOutput;
}

/** Characters that must not appear raw in the embedded JSON. */
const _GAS_CONFIG_UNSAFE_JSON = /[<\u2028\u2029]/g;

const _GasConfigUi = Object.freeze({
  /** Routes `GasConfigRpc` to this instance, replacing any earlier one. */
  register(config: GasConfig): void {
    _gasConfigRpcTarget.current = config;
  },

  /**
   * The state of the settings for the signed-in user: the effective values,
   * except for keys whose stored value is invalid, which carry that value and
   * are listed in `invalid`.
   */
  buildState(config: GasConfig): GasConfigSettingsState {
    const snapshot = config._readSnapshot();
    const values = { ...snapshot.values };
    for (const key of snapshot.invalid) {
      values[key] = snapshot.rejected[key] ?? null;
    }

    const state: GasConfigSettingsState = {
      title: config.title,
      ...(config.description !== undefined && {
        description: config.description,
      }),
      ...(config.brand.logoUrl !== undefined && {
        brand: { logoUrl: config.brand.logoUrl },
      }),
      groups: _GasConfigUi.clone(config.groups),
      fields: _GasConfigUi.clone(config._clientFields),
      canEdit: config._canEdit(),
      version: snapshot.version,
      values,
    };
    if (snapshot.invalid.length > 0) state.invalid = [...snapshot.invalid];
    return state;
  },

  /** Builds the page with its bootstrap embedded. */
  render(
    config: GasConfig,
    surface: GasConfigSurface,
  ): GoogleAppsScript.HTML.HtmlOutput {
    const html = _GAS_CONFIG_UI_HTML;
    const at = html.indexOf(_GAS_CONFIG_BOOTSTRAP_ELEMENT);
    if (at === -1) {
      throw new Error(
        '[GasConfig] The settings page has no bootstrap element. The generated page does not match the library: rebuild it with "gas-dev-config html".',
      );
    }

    const bootstrap: GasConfigBootstrap = {
      surface,
      theme: config.theme,
      brand: { ...config.brand },
      state: _GasConfigUi.buildState(config),
    };
    // Split rather than String.replace, whose "$" patterns would corrupt
    // stored values containing them.
    return HtmlService.createHtmlOutput(
      html.slice(0, at) +
        _GasConfigUi.bootstrapElement(bootstrap) +
        html.slice(at + _GAS_CONFIG_BOOTSTRAP_ELEMENT.length),
    );
  },

  /**
   * The bootstrap element. "<" and the line separators U+2028 and U+2029 are
   * escaped, so no stored value or title can close the element or break the
   * script; the JSON parses back to the same value.
   */
  bootstrapElement(bootstrap: GasConfigBootstrap): string {
    const json = JSON.stringify(bootstrap).replace(
      _GAS_CONFIG_UNSAFE_JSON,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    return `<script type="application/json" id="gas-config-bootstrap">${json}</script>`;
  },

  showDialog(
    config: GasConfig,
    ui: GoogleAppsScript.Base.Ui,
    options: GasConfigDialogOptions | undefined,
  ): void {
    const { title, width, height } = _GasConfigUi.dialogOptions(
      config,
      ui,
      options,
    );
    const output = _GasConfigUi.render(config, 'dialog');
    ui.showModalDialog(output.setWidth(width).setHeight(height), title);
  },

  showSidebar(
    config: GasConfig,
    ui: GoogleAppsScript.Base.Ui,
    options: GasConfigPageOptions | undefined,
  ): void {
    _GasConfigUi.requireUi(ui, 'showSidebar');
    const title = _GasConfigUi.pageTitle(config, options);
    ui.showSidebar(_GasConfigUi.render(config, 'sidebar').setTitle(title));
  },

  createHtmlOutput(
    config: GasConfig,
    options: GasConfigPageOptions | undefined,
  ): GoogleAppsScript.HTML.HtmlOutput {
    const title = _GasConfigUi.pageTitle(config, options);
    return _GasConfigUi
      .render(config, 'page')
      .setTitle(title)
      .addMetaTag('viewport', _GAS_CONFIG_VIEWPORT);
  },

  dialogOptions(
    config: GasConfig,
    ui: GoogleAppsScript.Base.Ui,
    options: GasConfigDialogOptions | undefined,
  ): { title: string; width: number; height: number } {
    _GasConfigUi.requireUi(ui, 'showModalDialog');
    const given = _GasConfigUi.requireOptions(options);

    const size = (name: 'width' | 'height', fallback: number): number => {
      const value = given[name];
      if (value === undefined) return fallback;
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(
          `[GasConfig] Invalid "${name}": expected a positive integer number of pixels.`,
        );
      }
      return value;
    };

    return {
      title: _GasConfigUi.pageTitle(config, given),
      width: size('width', _GAS_CONFIG_DIALOG_WIDTH),
      height: size('height', _GAS_CONFIG_DIALOG_HEIGHT),
    };
  },

  pageTitle(
    config: GasConfig,
    options: GasConfigPageOptions | undefined,
  ): string {
    const title = _GasConfigUi.requireOptions(options).title;
    if (title === undefined) return config.title;
    if (typeof title !== 'string' || title.trim() === '') {
      throw new Error(
        '[GasConfig] Invalid "title": expected a non-empty string.',
      );
    }
    return title;
  },

  requireOptions<T extends object>(options: T | undefined): Partial<T> {
    if (options === undefined) return {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('[GasConfig] Invalid options: expected an object.');
    }
    return options;
  },

  requireUi(ui: unknown, method: 'showModalDialog' | 'showSidebar'): void {
    if (
      !ui ||
      typeof ui !== 'object' ||
      typeof (ui as Record<string, unknown>)[method] !== 'function'
    ) {
      throw new Error(
        `[GasConfig] Invalid "ui": expected the Ui of the host document, such as the result of getUi(), exposing ${method}().`,
      );
    }
  },

  /** A deep copy, so the embedded state never aliases the schema. */
  clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  },

  /**
   * Handles one `GasConfigRpc` call. Success returns the result; every failure
   * throws `Error(JSON.stringify(envelope))`, which the browser parses.
   */
  handle(method: string, payload: unknown): unknown {
    const target = _gasConfigRpcTarget.current;

    try {
      if (!target) throw _GasConfigErrors.internal(_GAS_CONFIG_NO_INSTANCE);
      return _GasConfigUi.dispatch(target, method, payload);
    } catch (error) {
      // The envelope is the whole error contract; a cause never reaches the
      // browser, and the real error was logged by toEnvelope.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        JSON.stringify(_GasConfigUi.toEnvelope(error, target, method)),
      );
    }
  },

  dispatch(config: GasConfig, method: string, payload: unknown): unknown {
    switch (method) {
      case 'getSettings':
        return _GasConfigUi.buildState(config);
      case 'saveSettings':
        return _GasConfigUi.save(config, payload as GasConfigSaveRequest);
      default:
        throw _GasConfigErrors.validation(
          `[GasConfig] Unknown method: ${_GasConfigUi.label(method)}`,
        );
    }
  },

  /**
   * Saves under authorization and the lock, then logs what changed. The log
   * is written after the lock is released, so a slow logger cannot extend it.
   */
  save(
    config: GasConfig,
    request: GasConfigSaveRequest,
  ): GasConfigSaveResponse {
    const outcome = config._saveChanges(request);
    if (!outcome.ok) return outcome;

    const { changed, ...response } = outcome;
    if (changed.length > 0) {
      _GasConfigUi.log(config.logger, 'info', '[GasConfig] Settings changed', {
        user: config._userEmail(),
        changes: changed.map(({ key, from, to }) => ({ key, from, to })),
      });
    }
    return response;
  },

  /** Logs without ever letting a failing logger break the call. */
  log(
    logger: GasConfigLogger,
    level: 'info' | 'warn',
    message: string,
    meta: Record<string, unknown>,
  ): void {
    try {
      logger[level](message, meta);
    } catch (error) {
      try {
        console.warn('[GasConfig] The logger threw while logging.', { error });
      } catch {
        // Nothing left to report to.
      }
    }
  },

  /** A client-supplied method name, bounded for messages and logs. */
  label(method: unknown): string {
    return String(method).slice(0, 64);
  },

  /** Whether an error is an expected failure whose message is safe to show. */
  isOperational(
    error: unknown,
  ): error is Error & { statusCode: number; code: string; details?: unknown } {
    return (
      error instanceof Error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
      typeof (error as { code?: unknown }).code === 'string'
    );
  },

  /**
   * Maps a thrown value to the envelope the browser receives. Expected
   * failures keep their status, code and message. Anything else becomes a
   * generic 500, with the real error logged through `logger.warn`.
   *
   * With gas-error loaded, `GasError.handle` builds the envelope, so it is
   * logged once and shaped as in gas-webapp. It logs through the instance
   * logger, and its session lookup is replaced by a fixed label so the user's
   * email never reaches that log.
   */
  toEnvelope(
    error: unknown,
    config: GasConfig | null,
    method: string,
  ): GasConfigErrorEnvelope {
    const logger = config ? config.logger : _GAS_CONFIG_DEFAULT_LOGGER;

    if (
      typeof GasError === 'function' &&
      (error instanceof GasError || !_GasConfigUi.isOperational(error))
    ) {
      try {
        const sink = (message: string, meta?: Record<string, unknown>): void =>
          _GasConfigUi.log(logger, 'warn', message, meta ?? {});
        const safe = GasError.handle(error, {
          logger: { warn: sink, error: sink },
          method: 'rpc',
          path: `GasConfigRpc.${_GasConfigUi.label(method)}`,
          sessionId: 'redacted',
          rethrow: false,
        });
        return _GasConfigUi.envelope(
          safe.status,
          safe.code,
          safe.error,
          safe.details,
        );
      } catch {
        // Handled below as if gas-error were absent.
      }
    }

    if (_GasConfigUi.isOperational(error)) {
      return _GasConfigUi.envelope(
        error.statusCode,
        error.code,
        error.message,
        error.details,
      );
    }

    _GasConfigUi.log(
      logger,
      'warn',
      '[GasConfig] Unexpected error in GasConfigRpc',
      {
        method: _GasConfigUi.label(method),
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && { stack: error.stack }),
      },
    );
    return _GasConfigUi.envelope(
      500,
      'INTERNAL_ERROR',
      _GAS_CONFIG_GENERIC_ERROR,
    );
  },

  envelope(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ): GasConfigErrorEnvelope {
    return {
      ok: false,
      status,
      code,
      error: message,
      ...(details !== undefined && { details }),
    };
  },
});

Object.defineProperties(GasConfig.prototype, {
  showDialog: {
    value(
      this: GasConfig,
      ui: GoogleAppsScript.Base.Ui,
      options?: GasConfigDialogOptions,
    ): void {
      _GasConfigUi.showDialog(this, ui, options);
    },
    writable: true,
    configurable: true,
  },
  showSidebar: {
    value(
      this: GasConfig,
      ui: GoogleAppsScript.Base.Ui,
      options?: GasConfigPageOptions,
    ): void {
      _GasConfigUi.showSidebar(this, ui, options);
    },
    writable: true,
    configurable: true,
  },
  createHtmlOutput: {
    value(
      this: GasConfig,
      options?: GasConfigPageOptions,
    ): GoogleAppsScript.HTML.HtmlOutput {
      return _GasConfigUi.createHtmlOutput(this, options);
    },
    writable: true,
    configurable: true,
  },
});

/**
 * The one public entry point of the settings UI: the browser calls it through
 * `google.script.run.GasConfigRpc(method, payload)`.
 *
 * It routes to the most recently constructed `GasConfig`, so declare the
 * instance once, at global scope, to have it in every execution, including the
 * one this call starts. It must stay a function declaration:
 * `google.script.run` reaches top-level function declarations only, not a
 * `const` alias such as `const GasConfigRpc = ...` (gas-webapp P10).
 *
 * Methods: `getSettings()` and `saveSettings(request)`. Failures throw
 * `Error(JSON.stringify({ ok: false, status, code, error, details? }))`.
 */
function GasConfigRpc(method: string, payload?: unknown): unknown {
  return _GasConfigUi.handle(method, payload);
}
