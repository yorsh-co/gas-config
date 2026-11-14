'use strict';
/** Prefix of every Script Property gas-config owns. */
const _GAS_CONFIG_PROPERTY_PREFIX = 'gasConfig:';
/**
 * Metadata properties. Keys that match the schema key pattern cannot reach
 * them, as that pattern must start with a letter.
 */
const _GAS_CONFIG_VERSION_PROPERTY = `${_GAS_CONFIG_PROPERTY_PREFIX}__version`;
const _GAS_CONFIG_SAVE_ID_PROPERTY = `${_GAS_CONFIG_PROPERTY_PREFIX}__saveId`;
/**
 * Script Properties storage for the config values: one JSON-encoded property
 * per key, plus a version stamp and the last `saveId`.
 *
 * The properties are read once per instance and served from memory. Saves
 * re-read them under the lock, so a stale cache never overwrites another key.
 * No Apps Script service is touched until the first read or save.
 */
class _GasConfigStorage {
  constructor(fields, lockService, lockTimeoutMs) {
    this._properties = null;
    this._cache = null;
    this._fields = new Map(fields.map((field) => [field.key, field]));
    this._lockService = lockService;
    this._lockTimeoutMs = lockTimeoutMs;
  }
  /**
   * Checks a non-empty value against the shared declarative rules, plus the
   * type of booleans, which the shared rules accept unchecked.
   *
   * @returns An error message, or null when valid.
   */
  static check(field, value) {
    if (field.type === 'boolean' && typeof value !== 'boolean') {
      return 'Enter a valid value';
    }
    return GasConfigValidation.validateField(field, value);
  }
  /**
   * Returns the stored values as of the first read of this instance. A value
   * that is missing, or stored but unusable, is replaced by the field default.
   */
  read() {
    this._cache ?? (this._cache = this._snapshot(this._readStored()));
    return {
      values: { ...this._cache.values },
      version: this._cache.version,
      invalid: [...this._cache.invalid],
      rejected: { ...this._cache.rejected },
    };
  }
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
  save(request, validateChange) {
    const changes = this._parseChanges(request);
    return this._lockService.withLock(
      'script',
      () => {
        const stored = this._readStored();
        const current = this._snapshot(stored);
        if (stored[_GAS_CONFIG_SAVE_ID_PROPERTY] === request.saveId) {
          return {
            ok: true,
            values: current.values,
            version: current.version,
            changed: [],
          };
        }
        if (request.version !== current.version) {
          return { ok: false, reason: 'conflict', version: current.version };
        }
        const errors = {};
        for (const [key, value] of Object.entries(changes)) {
          const message = validateChange(key, value);
          if (message) errors[key] = message;
        }
        if (Object.keys(errors).length > 0) {
          return { ok: false, reason: 'invalid', errors };
        }
        const writes = {};
        for (const [key, value] of Object.entries(changes)) {
          const property = _GAS_CONFIG_PROPERTY_PREFIX + key;
          const isStored = property in stored;
          if (value === null) {
            // A cleared value is stored as JSON null, which reads as unset,
            // so the whole save stays one atomic write.
            if (isStored && stored[property] !== 'null')
              writes[property] = 'null';
          } else if (
            !isStored ||
            current.invalid.includes(key) ||
            current.values[key] !== value
          ) {
            writes[property] = JSON.stringify(value);
          }
        }
        if (Object.keys(writes).length === 0) {
          return {
            ok: true,
            values: current.values,
            version: current.version,
            changed: [],
          };
        }
        const version = Utilities.getUuid();
        writes[_GAS_CONFIG_VERSION_PROPERTY] = version;
        writes[_GAS_CONFIG_SAVE_ID_PROPERTY] = request.saveId;
        // One atomic write: if it throws, neither the values nor the version
        // changed, so a retry with the same saveId applies instead of replaying.
        this._getProperties().setProperties(writes, false);
        const next = { ...stored, ...writes };
        this._cache = this._snapshot(next);
        const changed = [];
        for (const key of Object.keys(changes)) {
          const from = current.values[key];
          const to = this._cache.values[key];
          if (from !== to) changed.push({ key, from, to });
        }
        return {
          ok: true,
          values: { ...this._cache.values },
          version,
          changed,
        };
      },
      { timeoutMs: this._lockTimeoutMs },
    );
  }
  /**
   * Validates the request shape and returns its changes, with empty values
   * normalised to `null` (booleans excepted).
   */
  _parseChanges(request) {
    if (
      !request ||
      typeof request !== 'object' ||
      !request.changes ||
      typeof request.changes !== 'object' ||
      Array.isArray(request.changes)
    ) {
      throw _GasConfigErrors.validation(
        '[GasConfig] Invalid save request: expected an object with "changes".',
      );
    }
    if (typeof request.version !== 'string') {
      throw _GasConfigErrors.validation(
        '[GasConfig] Invalid save request: "version" must be a string.',
      );
    }
    if (typeof request.saveId !== 'string' || request.saveId === '') {
      throw _GasConfigErrors.validation(
        '[GasConfig] Invalid save request: "saveId" must be a non-empty string.',
      );
    }
    const changes = {};
    for (const [key, value] of Object.entries(request.changes)) {
      if (!this._fields.has(key)) {
        throw _GasConfigErrors.validation(
          `[GasConfig] Unknown config key: ${key}`,
          { key },
        );
      }
      changes[key] =
        (value === undefined || value === '') &&
        this._fields.get(key)?.type !== 'boolean'
          ? null
          : value;
    }
    return changes;
  }
  /** Resolves Script Properties on first use, never at construction. */
  _getProperties() {
    this._properties ??
      (this._properties = PropertiesService.getScriptProperties());
    return this._properties;
  }
  _readStored() {
    return this._getProperties().getProperties();
  }
  /** Decodes the stored properties into the effective value of every key. */
  _snapshot(stored) {
    const values = {};
    const invalid = [];
    const rejected = {};
    for (const field of this._fields.values()) {
      values[field.key] = field.default;
      const raw = stored[_GAS_CONFIG_PROPERTY_PREFIX + field.key];
      if (raw === undefined) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        invalid.push(field.key);
        rejected[field.key] = raw;
        continue;
      }
      if (parsed === null || parsed === '') continue;
      if (_GasConfigStorage.check(field, parsed) !== null) {
        invalid.push(field.key);
        rejected[field.key] = _GasConfigStorage.isValue(parsed) ? parsed : null;
        continue;
      }
      values[field.key] = parsed;
    }
    return {
      values,
      version: stored[_GAS_CONFIG_VERSION_PROPERTY] ?? '',
      invalid,
      rejected,
    };
  }
  /** Whether a parsed JSON value is a `GasConfigValue`. */
  static isValue(value) {
    return (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }
}
