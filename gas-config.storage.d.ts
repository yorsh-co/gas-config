/** Prefix of every Script Property gas-config owns. */
declare const _GAS_CONFIG_PROPERTY_PREFIX = "gasConfig:";
/**
 * Metadata properties. Keys that match the schema key pattern cannot reach
 * them, as that pattern must start with a letter.
 */
declare const _GAS_CONFIG_VERSION_PROPERTY = "gasConfig:__version";
declare const _GAS_CONFIG_SAVE_ID_PROPERTY = "gasConfig:__saveId";
/**
 * Script Properties storage for the config values: one JSON-encoded property
 * per key, plus a version stamp and the last `saveId`.
 *
 * The properties are read once per instance and served from memory. Saves
 * re-read them under the lock, so a stale cache never overwrites another key.
 * No Apps Script service is touched until the first read or save.
 */
declare class _GasConfigStorage {
    private readonly _fields;
    private readonly _lockService;
    private readonly _lockTimeoutMs;
    private _properties;
    private _cache;
    constructor(fields: readonly GasConfigClientField[], lockService: GasConfigLockService, lockTimeoutMs: number);
    /**
     * Checks a non-empty value against the shared declarative rules, plus the
     * type of booleans, which the shared rules accept unchecked.
     *
     * @returns An error message, or null when valid.
     */
    static check(field: GasConfigClientField, value: unknown): string | null;
    /**
     * Returns the stored values as of the first read of this instance. A value
     * that is missing, or stored but unusable, is replaced by the field default.
     */
    read(): GasConfigSnapshot;
    /**
     * Applies a save under the script lock: every change is validated before
     * any is written.
     *
     * 1. Re-reads the properties, ignoring the cache.
     * 2. A `saveId` equal to the last saved one replays that save's success.
     * 3. A `version` other than the stored one is a conflict.
     * 4. Every change must pass `validateChange`.
     * 5. Only the changed keys, the new version and `saveId` are written in one
     *    `setProperties` call. A `null` change stores JSON `null`, read as unset.
     *
     * Throws a validation error for a malformed request or an unknown key. If a
     * write throws, the cache is left as it was.
     */
    save(request: GasConfigSaveRequest, validateChange: GasConfigChangeValidator): GasConfigSaveOutcome;
    /**
     * Validates the request shape and returns its changes, with empty values
     * normalised to `null` (booleans excepted).
     */
    private _parseChanges;
    /** Resolves Script Properties on first use, never at construction. */
    private _getProperties;
    private _readStored;
    /** Decodes the stored properties into the effective value of every key. */
    private _snapshot;
    /** Whether a parsed JSON value is a `GasConfigValue`. */
    private static isValue;
}
