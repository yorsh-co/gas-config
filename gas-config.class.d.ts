/** Field types a schema can declare. */
declare const _GAS_CONFIG_FIELD_TYPES: readonly GasConfigFieldType[];
/** Keys must start with a letter, which keeps internal keys unreachable. */
declare const _GAS_CONFIG_KEY_PATTERN: RegExp;
/** Roughly email-shaped: `x@y.z`, without whitespace. */
declare const _GAS_CONFIG_EMAIL_PATTERN: RegExp;
declare const _GAS_CONFIG_DEFAULT_TITLE = "Settings";
declare const _GAS_CONFIG_THEMES: readonly GasConfigTheme[];
/** `#rgb` or `#rrggbb`. */
declare const _GAS_CONFIG_COLOR_PATTERN: RegExp;
/** An `https:` URL without whitespace, or a `data:image/` URI. */
declare const _GAS_CONFIG_LOGO_PATTERN: RegExp;
declare const _GAS_CONFIG_DEFAULT_LOCK_TIMEOUT_MS = 30000;
/**
 * Used when no `logger` is injected. Deliberately minimal: it writes to the
 * execution log, keeping the `[GasConfig]` prefix and passing meta through as
 * an object when given. It has no levels, no bindings and no sheet sink —
 * inject a GasLogger for those; that logic lives there and only there.
 */
declare const _GAS_CONFIG_DEFAULT_LOGGER: GasConfigLogger;
/**
 * Used when no `lockService` is injected and the `GasLock` global is absent.
 * Deliberately minimal: it acquires a LockService lock and releases it,
 * nothing more. It does NOT reproduce gas-lock's ownership tracking. Apps
 * Script locks are owned per execution, so acquiring a scope an outer caller
 * already holds succeeds at once, but this releaseLock() then releases the
 * outer caller's lock too, ending its critical section early. Load GasLock
 * to get that safety; that logic lives there and only there.
 */
declare const _GAS_CONFIG_FALLBACK_LOCK_SERVICE: GasConfigLockService;
/**
 * Used when no `lockService` is injected: delegates to the `GasLock` global
 * when loaded, else to the minimal fallback. Resolved at each acquisition
 * rather than at construction, as a GasConfig is often constructed at top
 * level, before gas-lock's file has been evaluated.
 */
declare const _GAS_CONFIG_DEFAULT_LOCK_SERVICE: GasConfigLockService;
/**
 * Typed, schema-driven configuration stored in Script Properties.
 *
 * The constructor validates the schema and options but touches no Apps
 * Script service, so a global `new GasConfig(...)` is free until first use.
 * Values are read once per instance and cached.
 */
declare class GasConfig<S extends GasConfigSchema = GasConfigSchema> {
    title: string;
    appName?: string;
    description?: string;
    groups: GasConfigGroup[];
    theme: GasConfigTheme;
    brand: GasConfigBrand;
    logger: GasConfigLogger;
    lockService: GasConfigLockService;
    lockTimeoutMs: number;
    /**
     * The schema as the UI sees it, in declaration order.
     * @internal
     */
    _clientFields: GasConfigClientField[];
    private readonly _fields;
    private readonly _validators;
    private readonly _storage;
    private readonly _access;
    private readonly _warned;
    /**
     * Normalised emails allowed to change the settings; empty means nobody.
     * Returns a copy. May read Script Properties on first access.
     */
    get editors(): string[];
    /**
     * Normalised emails allowed to read besides `editors`; `[]` when none are
     * listed. Returns a copy. May read Script Properties on first access.
     */
    get readers(): string[];
    /**
     * Whether reads are limited to `editors` and `readers`. May read Script
     * Properties on first access.
     */
    get restrictReads(): boolean;
    constructor(options: GasConfigOptions<S>);
    /**
     * Returns the value of a key: the stored value, else the field default.
     * An unusable stored value also yields the default, with a warning that
     * names the key but never the value.
     *
     * Throws if the key is not in the schema.
     */
    get<K extends keyof S & string>(key: K): GasConfigFieldValue<S[K]>;
    /**
     * Returns every key with the rules of `get`, as a fresh object per call.
     */
    getAll(): GasConfigValues<S>;
    /**
     * Whether the signed-in user may change the settings. Reads Session on
     * first use.
     * @internal
     */
    _canEdit(): boolean;
    /**
     * Whether the signed-in user may read the settings. Reads Session only when
     * reads are restricted.
     * @internal
     */
    _canRead(): boolean;
    /**
     * Throws a 401 unless the signed-in user may read the settings. Reads
     * Session only when reads are restricted.
     * @internal
     */
    _assertCanRead(): void;
    /**
     * The signed-in user's email for change logging, or null when unidentified.
     * @internal
     */
    _userEmail(): string | null;
    /**
     * Returns the cached values with their version and invalid keys.
     * @internal
     */
    _readSnapshot(): GasConfigSnapshot;
    /**
     * Validates and saves changes under the script lock. There is no public
     * setter: the settings UI is the writer. Throws a 401 before locking or
     * reading anything unless the signed-in user is an editor.
     * @internal
     */
    _saveChanges(request: GasConfigSaveRequest): GasConfigSaveOutcome;
    /**
     * Checks a change with the shared rules, then the field's `validate`,
     * which only sees non-empty values that passed the shared rules.
     */
    private _validateChange;
    /** Logs a warning through the logger; never throws. */
    private _warn;
    /** Warns once per key about a stored value that was replaced. */
    private _warnInvalid;
    /** Validate a title, falling back to the library default when omitted. */
    private _resolveTitle;
    /** Validate a non-empty string option. */
    private _resolveText;
    /** Validate the groups, copying them. Ids must be unique. */
    private _resolveGroups;
    /** Validate a theme, falling back to `workspace` when omitted. */
    private _resolveTheme;
    /** Validate the brand overrides, copying them. */
    private _resolveBrand;
    /**
     * Validate an email list: trimmed, lowercased and deduplicated. Returns
     * `undefined` when omitted, so the Script Property applies.
     */
    private _resolveEmails;
    /**
     * Validate `restrictReads`; `false` contradicts a `readers` option.
     */
    private _resolveRestrictReads;
    /**
     * Validate every field of the schema and convert it to its client form.
     * Pure: nothing outside the schema is consulted. Server-only `validate`
     * functions are collected into `validators`.
     */
    private _resolveSchema;
    private _resolveField;
    /** Validate the declarative rules of a field. */
    private _resolveRules;
    /** Validate and copy the options of a `select` field. */
    private _resolveOptions;
    /**
     * Set the default of a field. Empty defaults are allowed, as a required
     * field is simply invalid until filled; a non-empty one must satisfy the
     * field's own type and declarative rules.
     */
    private _applyDefault;
    private _invalidField;
    /**
     * Validate a lockService, falling back to the library default when omitted.
     */
    private _resolveLockService;
    /**
     * Validate a lock timeout in milliseconds, falling back to the library
     * default when omitted.
     */
    private _resolveLockTimeoutMs;
    /** Validate a logger, falling back to the library default when omitted. */
    private _resolveLogger;
}
