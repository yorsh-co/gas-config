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
declare const _GAS_CONFIG_BOOTSTRAP_ELEMENT = "<script type=\"application/json\" id=\"gas-config-bootstrap\">{}</script>";
declare const _GAS_CONFIG_DIALOG_WIDTH = 600;
declare const _GAS_CONFIG_DIALOG_HEIGHT = 560;
/** HtmlService drops a literal viewport meta, so it is added on the output. */
declare const _GAS_CONFIG_VIEWPORT = "width=device-width, initial-scale=1";
/** What the browser shows for a failure that is not the user's to fix. */
declare const _GAS_CONFIG_GENERIC_ERROR = "Something went wrong. Try again.";
declare const _GAS_CONFIG_NO_INSTANCE = "[GasConfig] No GasConfig instance is registered. Declare it once, at global scope, so it exists in every execution.";
/** The instance `GasConfigRpc` routes to: the most recently constructed. */
declare const _gasConfigRpcTarget: {
    current: GasConfig | null;
};
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
     * const config = new GasConfig({ schema }); // editors come from GAS_CONFIG_EDITORS
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
    showDialog(ui: GoogleAppsScript.Base.Ui, options?: GasConfigDialogOptions): void;
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
    showSidebar(ui: GoogleAppsScript.Base.Ui, options?: GasConfigPageOptions): void;
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
    createHtmlOutput(options?: GasConfigPageOptions): GoogleAppsScript.HTML.HtmlOutput;
}
/** Characters that must not appear raw in the embedded JSON. */
declare const _GAS_CONFIG_UNSAFE_JSON: RegExp;
declare const _GasConfigUi: Readonly<{
    /** Routes `GasConfigRpc` to this instance, replacing any earlier one. */
    register(config: GasConfig): void;
    /**
     * The state of the settings for the signed-in user: the effective values,
     * except for keys whose stored value is invalid, which carry that value and
     * are listed in `invalid`.
     */
    buildState(config: GasConfig): GasConfigSettingsState;
    /**
     * What a user without read access sees: the title, the appName and the
     * logo. Nothing that describes the settings.
     */
    deniedState(config: GasConfig): GasConfigDeniedState;
    /** Builds the page with its bootstrap embedded. */
    render(config: GasConfig, surface: GasConfigSurface): GoogleAppsScript.HTML.HtmlOutput;
    /**
     * The bootstrap element. "<" and the line separators U+2028 and U+2029 are
     * escaped, so no stored value or title can close the element or break the
     * script; the JSON parses back to the same value.
     */
    bootstrapElement(bootstrap: GasConfigBootstrap): string;
    showDialog(config: GasConfig, ui: GoogleAppsScript.Base.Ui, options: GasConfigDialogOptions | undefined): void;
    showSidebar(config: GasConfig, ui: GoogleAppsScript.Base.Ui, options: GasConfigPageOptions | undefined): void;
    createHtmlOutput(config: GasConfig, options: GasConfigPageOptions | undefined): GoogleAppsScript.HTML.HtmlOutput;
    dialogOptions(config: GasConfig, ui: GoogleAppsScript.Base.Ui, options: GasConfigDialogOptions | undefined): {
        title: string;
        width: number;
        height: number;
    };
    pageTitle(config: GasConfig, options: GasConfigPageOptions | undefined): string;
    requireOptions<T extends object>(options: T | undefined): Partial<T>;
    requireUi(ui: unknown, method: "showModalDialog" | "showSidebar"): void;
    /** A deep copy, so the embedded state never aliases the schema. */
    clone<T>(value: T): T;
    /**
     * Handles one `GasConfigRpc` call. Success returns the result; every failure
     * throws `Error(JSON.stringify(envelope))`, which the browser parses.
     */
    handle(method: string, payload: unknown): unknown;
    dispatch(config: GasConfig, method: string, payload: unknown): unknown;
    /**
     * Saves under authorization and the lock, then logs what changed. The log
     * is written after the lock is released, so a slow logger cannot extend it.
     */
    save(config: GasConfig, request: GasConfigSaveRequest): GasConfigSaveResponse;
    /** Logs without ever letting a failing logger break the call. */
    log(logger: GasConfigLogger, level: "info" | "warn", message: string, meta: Record<string, unknown>): void;
    /** A client-supplied method name, bounded for messages and logs. */
    label(method: unknown): string;
    /** Whether an error is an expected failure whose message is safe to show. */
    isOperational(error: unknown): error is Error & {
        statusCode: number;
        code: string;
        details?: unknown;
    };
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
    toEnvelope(error: unknown, config: GasConfig | null, method: string): GasConfigErrorEnvelope;
    envelope(status: number, code: string, message: string, details?: unknown): GasConfigErrorEnvelope;
}>;
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
declare function GasConfigRpc(method: string, payload?: unknown): unknown;
