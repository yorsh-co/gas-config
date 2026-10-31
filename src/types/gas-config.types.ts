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
  /** Emails allowed to change the settings. Enforced from the access phase. */
  editors?: string[];
  /** @default 'Settings' */
  title?: string;
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

/** Stored values as of one read of the properties. */
interface GasConfigSnapshot {
  /** Effective value of every key: the stored value, else the default. */
  values: Record<string, GasConfigValue>;
  /** Opaque stamp of the stored values; empty until something is saved. */
  version: string;
  /** Keys whose stored value is unusable and was replaced by the default. */
  invalid: string[];
  /**
   * The stored value of each invalid key: as parsed when it is a
   * `GasConfigValue`, the stored text when it is not valid JSON, else `null`.
   */
  rejected: Record<string, GasConfigValue>;
}

/** One key changed by a save. Values are the effective ones, defaults included. */
interface GasConfigChange {
  key: string;
  from: GasConfigValue;
  to: GasConfigValue;
}

/** A successful save, with what changed for the caller to log. */
interface GasConfigSaveApplied extends GasConfigSaveSuccess {
  changed: GasConfigChange[];
}

/** Outcome of a save as returned by the storage. */
type GasConfigSaveOutcome =
  GasConfigSaveApplied | GasConfigSaveInvalid | GasConfigSaveConflict;

/** Checks one change, returning an error message or `null` when valid. */
type GasConfigChangeValidator = (
  key: string,
  value: GasConfigValue,
) => string | null;
