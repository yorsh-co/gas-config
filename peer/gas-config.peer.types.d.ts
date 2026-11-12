/**
 * Ambient declarations for gas-config, consumed as a peer subtree package.
 *
 * gas-config is expected as a runtime global (Apps Script has no module
 * system); this file declares its public surface so a consuming package can
 * typecheck standalone via `tsc --noEmit` without vendoring the source.
 *
 * Canonical copy: gas-config/peer/gas-config.peer.types.d.ts. Do not edit
 * downstream copies — update the canonical file and re-copy, so every peer
 * stays in step with the published surface.
 *
 * Being a `.d.ts`, this file is type-only: it matches a consumer's
 * `include: ["src/**\/*.ts"]` but emits nothing, so no counterpart reaches
 * dist/ or the published package.
 *
 * Usage: list `gas-config` in `gasdev.peers` and run
 * `gasdev peers sync`, which writes it to `src/internal/`.
 *
 * @see https://github.com/yorsh-co/gas-config
 * @version 2.2.0
 */

/** Every field type a schema can declare. */
type GasConfigFieldType =
  'string' | 'text' | 'number' | 'boolean' | 'select' | 'url' | 'date';

/** A stored or transferred value. `null` is empty; booleans are never empty. */
type GasConfigValue = string | number | boolean | null;

/** One choice of a `select` field. */
interface GasConfigOption {
  value: string;
  label: string;
}

/** Declarative rules checked by both the browser and the server. */
interface GasConfigClientRules {
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  /** Regular expression source, without delimiters or flags. */
  pattern?: string;
  patternMessage?: string;
}

/** A schema field as the UI sees it: no server-only `validate`. */
interface GasConfigClientField {
  key: string;
  type: GasConfigFieldType;
  label: string;
  description?: string;
  group?: string;
  required: boolean;
  default: GasConfigValue;
  placeholder?: string;
  options?: GasConfigOption[];
  rules?: GasConfigClientRules;
}

/** A settings group, rendered as a section by the UI. */
interface GasConfigGroup {
  id: string;
  label: string;
  description?: string;
}

/** Everything the UI needs to render the settings and edit them. */
interface GasConfigSettingsState {
  title: string;
  appName?: string;
  description?: string;
  canEdit: boolean;
  /** Opaque stamp of the stored values, sent back with each save. */
  version: string;
  brand?: { logoUrl?: string };
  groups: GasConfigGroup[];
  fields: GasConfigClientField[];
  values: Record<string, GasConfigValue>;
  /**
   * Keys whose stored value failed validation. `values` carries the stored
   * value for them, so the UI can show it flagged from the first render.
   */
  invalid?: string[];
}

/** Payload of `saveSettings`: only the changed keys. */
interface GasConfigSaveRequest {
  changes: Record<string, GasConfigValue>;
  /** The `version` the UI last received. */
  version: string;
  /** Client-generated and unique per save attempt; a retry reuses it. */
  saveId: string;
}

/** The save was applied, or `saveId` repeats the last successful save. */
interface GasConfigSaveSuccess {
  ok: true;
  values: Record<string, GasConfigValue>;
  version: string;
}

/** One or more changes failed validation; nothing was written. */
interface GasConfigSaveInvalid {
  ok: false;
  reason: 'invalid';
  errors: Record<string, string>;
}

/** The stored version moved on since the UI loaded; nothing was written. */
interface GasConfigSaveConflict {
  ok: false;
  reason: 'conflict';
  /** The current stored version. */
  version: string;
}

/** Outcome of `saveSettings`. Failures such as 401 use the error envelope. */
type GasConfigSaveResponse =
  GasConfigSaveSuccess | GasConfigSaveInvalid | GasConfigSaveConflict;

/** Methods routed by `GasConfigRpc`, with their payload and result. */
interface GasConfigRpcMethods {
  getSettings: {
    payload: undefined;
    result: GasConfigSettingsState;
  };
  saveSettings: {
    payload: GasConfigSaveRequest;
    result: GasConfigSaveResponse;
  };
}

/** Name of a method routed by `GasConfigRpc`. */
type GasConfigRpcMethod = keyof GasConfigRpcMethods;

/** A request to `GasConfigRpc`, discriminated on `method`. */
type GasConfigRpcRequest = {
  [M in GasConfigRpcMethod]: {
    method: M;
    payload: GasConfigRpcMethods[M]['payload'];
  };
}[GasConfigRpcMethod];

/**
 * The error `GasConfigRpc` throws, serialised as `Error(JSON.stringify(...))`
 * and parsed by the browser client. Same shape as gas-webapp's envelope.
 */
interface GasConfigErrorEnvelope {
  ok: false;
  status: number;
  code: string;
  error: string;
  details?: unknown;
}

/** Page surfaces the UI renders for. */
type GasConfigSurface = 'dialog' | 'sidebar' | 'page';

/** Built-in visual themes. */
type GasConfigTheme = 'workspace' | 'yorsh';

/** What a user without read access sees: identity of the UI, no settings. */
interface GasConfigDeniedState {
  title: string;
  appName?: string;
  brand?: { logoUrl?: string };
}

/**
 * JSON the server embeds in the page's `#gas-config-bootstrap` element. Every
 * key is optional: an empty object makes the UI fetch its own state. A
 * bootstrap carries `state` or `denied`, never both.
 */
interface GasConfigBootstrap {
  surface?: GasConfigSurface;
  theme?: GasConfigTheme;
  brand?: {
    /** Validated CSS colour, applied as `--color-primary`. */
    primaryColor?: string;
    logoUrl?: string;
  };
  /** When present, rendered immediately with no `getSettings` call. */
  state?: GasConfigSettingsState;
  /** Present instead of `state` when the user may not read the settings. */
  denied?: GasConfigDeniedState;
}

/** Value type of each field `type`. Empty is `null`, except for booleans. */
interface GasConfigValueTypes {
  string: string;
  text: string;
  url: string;
  select: string;
  date: string;
  number: number;
  boolean: boolean;
}

/**
 * Type of the value `get()` returns for a field `type`: the value type, or
 * `null` when empty. Booleans are never empty.
 */
type GasConfigTypedValue<T extends GasConfigFieldType> = T extends 'boolean'
  ? boolean
  : GasConfigValueTypes[T] | null;

/**
 * Keys shared by every field type. `V` is the value type; `D` is the type of
 * `default`, which constrains it by field `type`.
 */
interface GasConfigFieldBase<V, D = V | null> {
  label: string;
  description?: string;
  /** Id of an entry of the `groups` option. */
  group?: string;
  /** An empty required field is invalid until filled. @default false */
  required?: boolean;
  /** Returned while nothing is stored. Booleans default to `false`. */
  default?: D;
  placeholder?: string;
  /**
   * Server-only check, called for non-empty values that already pass the
   * declarative rules. Returns an error message, or `null` when valid.
   */
  validate?: (value: V) => string | null;
}

/** `string`, `text` and `url` fields. A `url` must start with `https://`. */
interface GasConfigStringField extends GasConfigFieldBase<string> {
  type: 'string' | 'text' | 'url';
  maxLength?: number;
  /** Regular expression source, without delimiters or flags. */
  pattern?: string;
  patternMessage?: string;
}

interface GasConfigNumberField extends GasConfigFieldBase<number> {
  type: 'number';
  min?: number;
  max?: number;
  integer?: boolean;
}

interface GasConfigBooleanField extends GasConfigFieldBase<boolean, boolean> {
  type: 'boolean';
}

interface GasConfigSelectField extends GasConfigFieldBase<string> {
  type: 'select';
  options: GasConfigOption[];
}

/** Values are `'YYYY-MM-DD'` strings. */
interface GasConfigDateField extends GasConfigFieldBase<string> {
  type: 'date';
}

/** A schema field, discriminated on `type`. */
type GasConfigField =
  | GasConfigStringField
  | GasConfigNumberField
  | GasConfigBooleanField
  | GasConfigSelectField
  | GasConfigDateField;

/** Fields keyed by config key. A key matches `/^[A-Za-z][A-Za-z0-9_.-]*$/`. */
type GasConfigSchema = Record<string, GasConfigField>;

/** Type `get()` returns for a field. */
type GasConfigFieldValue<F extends GasConfigField> = GasConfigTypedValue<
  F['type']
>;

/** Type `getAll()` returns for a schema. */
type GasConfigValues<S extends GasConfigSchema> = {
  [K in keyof S & string]: GasConfigFieldValue<S[K]>;
};

/** Which LockService lock a `withLock` call acquires. */
type GasConfigLockScope = 'script' | 'document' | 'user';

/**
 * Minimal lock-service shape gas-config needs to guard its writes. GasLock
 * (github.com/yorsh-co/gas-lock) satisfies this directly and is used
 * automatically when loaded. Without it, gas-config falls back to acquiring
 * Apps Script's LockService directly, with no tracking of locks the
 * execution already holds.
 */
interface GasConfigLockService {
  withLock<T>(
    scope: GasConfigLockScope,
    callback: () => T,
    options?: { timeoutMs?: number },
  ): T;
}

/**
 * Minimal logging surface gas-config needs. GasLogger
 * (github.com/yorsh-co/gas-logger) satisfies it directly, and so does
 * `console`. Omit it and gas-config writes to the execution log.
 */
interface GasConfigLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

/** Brand overrides of the settings UI. */
interface GasConfigBrand {
  /** `#rgb` or `#rrggbb`. Replaces the theme's primary colour. */
  primaryColor?: string;
  /** An `https:` URL or a `data:image/` URI, shown by the `yorsh` theme. */
  logoUrl?: string;
}

/** Options of `GasConfig.showDialog`. */
interface GasConfigDialogOptions {
  /** @default the `title` of the instance */
  title?: string;
  /** In pixels. @default 600 */
  width?: number;
  /** In pixels. @default 560 */
  height?: number;
}

/** Options of `GasConfig.showSidebar` and `GasConfig.createHtmlOutput`. */
interface GasConfigPageOptions {
  /** @default the `title` of the instance */
  title?: string;
}

/** Options of the `GasConfig` constructor. */
interface GasConfigOptions<S extends GasConfigSchema = GasConfigSchema> {
  schema: S;
  groups?: GasConfigGroup[];
  /** Emails allowed to change the settings. Omitted or empty means nobody. */
  editors?: string[];
  /**
   * Emails allowed to read the settings, besides `editors`. Setting it
   * restricts reads; `undefined` leaves reads open to everyone, `[]` limits
   * them to `editors`.
   */
  readers?: string[];
  /**
   * Limits reads to `editors` (and `readers`). Omitted or `false` leaves reads
   * open unless `readers` is set; `false` with `readers` throws.
   */
  restrictReads?: boolean;
  /** @default 'Settings' */
  title?: string;
  /** Names the project above the page title and in the tab. Shown on the page surface only. */
  appName?: string;
  description?: string;
  /** Visual theme of the settings UI. @default 'workspace' */
  theme?: GasConfigTheme;
  brand?: GasConfigBrand;
  /** @default writes to the execution log, prefixed `[GasConfig]` */
  logger?: GasConfigLogger;
  /** @default the `GasLock` global when loaded, else an internal fallback calling LockService directly */
  lockService?: GasConfigLockService;
  /** @default 30000 */
  lockTimeoutMs?: number;
}

/** Codes of the expected failures gas-config throws. */
type GasConfigErrorCode =
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';

/**
 * Expected failure thrown when gas-error is not loaded; with gas-error
 * present, its `GasValidationError`, `GasUnauthorizedError` and
 * `GasError` are thrown instead. Carries the same
 * fields as `GasError`. Configuration errors are plain `Error`s.
 */
declare class GasConfigError extends Error {
  statusCode: number;
  code: GasConfigErrorCode;
  details: unknown;
  isOperational: true;

  private constructor();
}

/**
 * Typed, schema-driven configuration stored in Script Properties, edited
 * through a settings UI in a dialog, a sidebar or a web page.
 *
 * The constructor validates the schema and options but touches no Apps
 * Script service, so a global `new GasConfig(...)` is free until first use.
 * Declare the instance once, at global scope: `GasConfigRpc` routes the UI's
 * calls to the most recently constructed instance.
 */
declare class GasConfig<S extends GasConfigSchema = GasConfigSchema> {
  title: string;
  appName?: string;
  description?: string;
  groups: GasConfigGroup[];
  theme: GasConfigTheme;
  brand: GasConfigBrand;
  /** Normalised emails allowed to change the settings; empty means nobody. */
  editors: string[];
  /** Whether reads are limited to `editors` and `readers`; true whenever `readers` was given. */
  restrictReads: boolean;
  /** Normalised emails allowed to read besides `editors`; `[]` when omitted. */
  readers: string[];
  logger: GasConfigLogger;
  lockService: GasConfigLockService;
  lockTimeoutMs: number;

  constructor(options: GasConfigOptions<S>);

  /**
   * Returns the value of a key: the stored value, else the field default.
   * Throws if the key is not in the schema.
   */
  get<K extends keyof S & string>(key: K): GasConfigFieldValue<S[K]>;

  /** Returns every key with the rules of `get`, as a fresh object per call. */
  getAll(): GasConfigValues<S>;

  /**
   * Opens the settings in a modal dialog. The caller passes the `Ui` of its
   * host document, so the library names no document service.
   */
  showDialog(
    ui: GoogleAppsScript.Base.Ui,
    options?: GasConfigDialogOptions,
  ): void;

  /** Opens the settings in the sidebar of the host document. */
  showSidebar(
    ui: GoogleAppsScript.Base.Ui,
    options?: GasConfigPageOptions,
  ): void;

  /** Returns the settings as a full page, for a web app's `doGet`. */
  createHtmlOutput(
    options?: GasConfigPageOptions,
  ): GoogleAppsScript.HTML.HtmlOutput;
}

/**
 * The entry point the settings UI calls through
 * `google.script.run.GasConfigRpc(method, payload)`. Failures throw
 * `Error(JSON.stringify(envelope))`, with a `GasConfigErrorEnvelope`.
 */
declare function GasConfigRpc(method: string, payload?: unknown): unknown;
