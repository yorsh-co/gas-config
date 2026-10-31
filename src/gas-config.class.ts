/** Field types a schema can declare. */
const _GAS_CONFIG_FIELD_TYPES: readonly GasConfigFieldType[] = Object.freeze([
  'string',
  'text',
  'number',
  'boolean',
  'select',
  'url',
  'date',
]);

/** Keys must start with a letter, which keeps internal keys unreachable. */
const _GAS_CONFIG_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/** Roughly email-shaped: `x@y.z`, without whitespace. */
const _GAS_CONFIG_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const _GAS_CONFIG_DEFAULT_TITLE = 'Settings';

const _GAS_CONFIG_THEMES: readonly GasConfigTheme[] = Object.freeze([
  'workspace',
  'yorsh',
]);

/** `#rgb` or `#rrggbb`. */
const _GAS_CONFIG_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** An `https:` URL without whitespace, or a `data:image/` URI. */
const _GAS_CONFIG_LOGO_PATTERN =
  /^(?:https:\/\/\S+|data:image\/[\w.+-]+[;,]\S*)$/i;

const _GAS_CONFIG_DEFAULT_LOCK_TIMEOUT_MS = 30000;

/**
 * Used when no `logger` is injected. Deliberately minimal: it writes to the
 * execution log, keeping the `[GasConfig]` prefix and passing meta through as
 * an object when given. It has no levels, no bindings and no sheet sink —
 * inject a GasLogger for those; that logic lives there and only there.
 */
const _GAS_CONFIG_DEFAULT_LOGGER: GasConfigLogger = (() => {
  const write = (
    log: (...data: unknown[]) => void,
    msg: string,
    meta?: Record<string, unknown>,
  ): void => {
    const line = msg.startsWith('[GasConfig]') ? msg : `[GasConfig] ${msg}`;
    if (meta) log(line, meta);
    else log(line);
  };

  return Object.freeze({
    info: (msg: string, meta?: Record<string, unknown>): void =>
      write(console.log, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>): void =>
      write(console.warn, msg, meta),
  });
})();

/**
 * Used when no `lockService` is injected and the `GasLock` global is absent.
 * Deliberately minimal: it acquires a LockService lock and releases it,
 * nothing more. It does NOT reproduce gas-lock's ownership tracking. Apps
 * Script locks are owned per execution, so acquiring a scope an outer caller
 * already holds succeeds at once, but this releaseLock() then releases the
 * outer caller's lock too, ending its critical section early. Load GasLock
 * to get that safety; that logic lives there and only there.
 */
const _GAS_CONFIG_FALLBACK_LOCK_SERVICE: GasConfigLockService = Object.freeze({
  withLock<T>(
    scope: GasConfigLockScope,
    callback: () => T,
    options: { timeoutMs?: number } = {},
  ): T {
    const lock =
      scope === 'document'
        ? LockService.getDocumentLock()
        : scope === 'user'
          ? LockService.getUserLock()
          : LockService.getScriptLock();

    if (!lock) {
      throw new Error(
        `[GasConfig] LockService returned no lock for scope "${scope}" — "document" locks are unavailable outside the context of a containing document (e.g. a web app execution). Use "script" or "user", or inject a lockService such as GasLock.`,
      );
    }

    lock.waitLock(options.timeoutMs ?? _GAS_CONFIG_DEFAULT_LOCK_TIMEOUT_MS);
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  },
});

/**
 * Used when no `lockService` is injected: delegates to the `GasLock` global
 * when loaded, else to the minimal fallback. Resolved at each acquisition
 * rather than at construction, as a GasConfig is often constructed at top
 * level, before gas-lock's file has been evaluated.
 */
const _GAS_CONFIG_DEFAULT_LOCK_SERVICE: GasConfigLockService = Object.freeze({
  withLock<T>(
    scope: GasConfigLockScope,
    callback: () => T,
    options?: { timeoutMs?: number },
  ): T {
    let service = _GAS_CONFIG_FALLBACK_LOCK_SERVICE;

    try {
      if (
        typeof GasLock !== 'undefined' &&
        typeof GasLock.withLock === 'function'
      ) {
        service = GasLock;
      }
    } catch {
      // typeof on a binding not yet initialised throws a ReferenceError
    }

    return service.withLock(scope, callback, options);
  },
});

/**
 * Typed, schema-driven configuration stored in Script Properties.
 *
 * The constructor validates the schema and options but touches no Apps
 * Script service, so a global `new GasConfig(...)` is free until first use.
 * Values are read once per instance and cached.
 */
class GasConfig<S extends GasConfigSchema = GasConfigSchema> {
  title: string;
  description?: string;
  groups: GasConfigGroup[];
  theme: GasConfigTheme;
  brand: GasConfigBrand;
  /** Normalised emails allowed to change the settings; empty means nobody. */
  editors: string[];
  logger: GasConfigLogger;
  lockService: GasConfigLockService;
  lockTimeoutMs: number;

  /**
   * The schema as the UI sees it, in declaration order.
   * @internal
   */
  _clientFields: GasConfigClientField[];

  private readonly _fields: ReadonlyMap<string, GasConfigClientField>;
  private readonly _validators: ReadonlyMap<
    string,
    (value: GasConfigValue) => string | null
  >;
  private readonly _storage: _GasConfigStorage;
  private readonly _access: _GasConfigAccess;
  private readonly _warned = new Set<string>();

  constructor(options: GasConfigOptions<S>) {
    if (!options || typeof options !== 'object') {
      throw new Error(
        '[GasConfig] Invalid options: expected an object with a "schema".',
      );
    }

    this.title = this._resolveTitle(options.title);
    if (options.description !== undefined) {
      this.description = this._resolveText('description', options.description);
    }
    this.groups = this._resolveGroups(options.groups);
    this.theme = this._resolveTheme(options.theme);
    this.brand = this._resolveBrand(options.brand);
    this.editors = this._resolveEditors(options.editors);

    const validators = new Map<
      string,
      (value: GasConfigValue) => string | null
    >();
    this._clientFields = this._resolveSchema(
      options.schema,
      new Set(this.groups.map((group) => group.id)),
      validators,
    );
    this._fields = new Map(
      this._clientFields.map((field) => [field.key, field]),
    );
    this._validators = validators;

    this.lockService = this._resolveLockService(options.lockService);
    this.lockTimeoutMs = this._resolveLockTimeoutMs(options.lockTimeoutMs);
    this.logger = this._resolveLogger(options.logger);

    this._access = new _GasConfigAccess(this.editors);
    this._storage = new _GasConfigStorage(
      this._clientFields,
      this.lockService,
      this.lockTimeoutMs,
    );

    _GasConfigUi.register(this);
  }

  /**
   * Returns the value of a key: the stored value, else the field default.
   * An unusable stored value also yields the default, with a warning that
   * names the key but never the value.
   *
   * Throws if the key is not in the schema.
   */
  get<K extends keyof S & string>(key: K): GasConfigFieldValue<S[K]> {
    if (!this._fields.has(key)) {
      throw new Error(`[GasConfig] Unknown config key: ${key}`);
    }

    const snapshot = this._storage.read();
    this._warnInvalid(snapshot.invalid.filter((invalid) => invalid === key));

    return snapshot.values[key] as GasConfigFieldValue<S[K]>;
  }

  /**
   * Returns every key with the rules of `get`, as a fresh object per call.
   */
  getAll(): GasConfigValues<S> {
    const snapshot = this._storage.read();
    this._warnInvalid(snapshot.invalid);

    return snapshot.values as GasConfigValues<S>;
  }

  /**
   * Whether the signed-in user may change the settings. Reads Session on
   * first use.
   * @internal
   */
  _canEdit(): boolean {
    return this._access.canEdit();
  }

  /**
   * The signed-in user's email for change logging, or null when unidentified.
   * @internal
   */
  _userEmail(): string | null {
    return this._access.identify();
  }

  /**
   * Returns the cached values with their version and invalid keys.
   * @internal
   */
  _readSnapshot(): GasConfigSnapshot {
    return this._storage.read();
  }

  /**
   * Validates and saves changes under the script lock. There is no public
   * setter: the settings UI is the writer. Throws a 401 before locking or
   * reading anything unless the signed-in user is an editor.
   * @internal
   */
  _saveChanges(request: GasConfigSaveRequest): GasConfigSaveOutcome {
    this._access.assertCanEdit();

    return this._storage.save(request, (key, value) =>
      this._validateChange(key, value),
    );
  }

  /**
   * Checks a change with the shared rules, then the field's `validate`,
   * which only sees non-empty values that passed the shared rules.
   */
  private _validateChange(key: string, value: GasConfigValue): string | null {
    const field = this._fields.get(key);
    if (!field) return 'Unknown setting';

    const message = _GasConfigStorage.check(field, value);
    if (message) return message;

    return value === null ? null : (this._validators.get(key)?.(value) ?? null);
  }

  /** Warns once per key about a stored value that was replaced. */
  private _warnInvalid(keys: readonly string[]): void {
    for (const key of keys) {
      if (this._warned.has(key)) continue;
      this._warned.add(key);

      try {
        this.logger.warn(
          `Stored value for "${key}" is invalid; using the default.`,
          { key },
        );
      } catch (error) {
        console.warn('[GasConfig] The logger threw while logging a warning.', {
          error,
        });
      }
    }
  }

  /** Validate a title, falling back to the library default when omitted. */
  private _resolveTitle(title?: string): string {
    if (title === undefined) return _GAS_CONFIG_DEFAULT_TITLE;
    return this._resolveText('title', title);
  }

  /** Validate a non-empty string option. */
  private _resolveText(name: string, value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `[GasConfig] Invalid "${name}": expected a non-empty string.`,
      );
    }
    return value;
  }

  /** Validate the groups, copying them. Ids must be unique. */
  private _resolveGroups(groups?: GasConfigGroup[]): GasConfigGroup[] {
    if (groups === undefined) return [];
    if (!Array.isArray(groups)) {
      throw new Error(
        '[GasConfig] Invalid "groups": expected an array of { id, label, description? }.',
      );
    }

    const ids = new Set<string>();
    return groups.map((group) => {
      if (!group || typeof group !== 'object') {
        throw new Error(
          '[GasConfig] Invalid "groups": every group must be an object.',
        );
      }

      const id = this._resolveText('groups[].id', group.id);
      const label = this._resolveText(`groups["${id}"].label`, group.label);
      if (ids.has(id)) {
        throw new Error(
          `[GasConfig] Invalid "groups": duplicate group id "${id}".`,
        );
      }
      ids.add(id);

      const resolved: GasConfigGroup = { id, label };
      if (group.description !== undefined) {
        resolved.description = this._resolveText(
          `groups["${id}"].description`,
          group.description,
        );
      }
      return resolved;
    });
  }

  /** Validate a theme, falling back to `workspace` when omitted. */
  private _resolveTheme(theme?: GasConfigTheme): GasConfigTheme {
    if (theme === undefined) return 'workspace';
    if (!_GAS_CONFIG_THEMES.includes(theme)) {
      throw new Error(
        `[GasConfig] Invalid "theme": expected one of ${_GAS_CONFIG_THEMES.join(', ')}.`,
      );
    }
    return theme;
  }

  /** Validate the brand overrides, copying them. */
  private _resolveBrand(brand?: GasConfigBrand): GasConfigBrand {
    if (brand === undefined) return {};
    if (!brand || typeof brand !== 'object' || Array.isArray(brand)) {
      throw new Error(
        '[GasConfig] Invalid "brand": expected an object of { primaryColor?, logoUrl? }.',
      );
    }

    const resolved: GasConfigBrand = {};
    if (brand.primaryColor !== undefined) {
      if (
        typeof brand.primaryColor !== 'string' ||
        !_GAS_CONFIG_COLOR_PATTERN.test(brand.primaryColor)
      ) {
        throw new Error(
          '[GasConfig] Invalid "brand.primaryColor": expected a hex colour such as #7a1f5c or #fff.',
        );
      }
      resolved.primaryColor = brand.primaryColor;
    }
    if (brand.logoUrl !== undefined) {
      if (
        typeof brand.logoUrl !== 'string' ||
        !_GAS_CONFIG_LOGO_PATTERN.test(brand.logoUrl)
      ) {
        throw new Error(
          '[GasConfig] Invalid "brand.logoUrl": expected an https: URL or a data:image/ URI.',
        );
      }
      resolved.logoUrl = brand.logoUrl;
    }
    return resolved;
  }

  /**
   * Validate the editors list: trimmed, lowercased and deduplicated. Omitted
   * or empty means nobody can edit.
   */
  private _resolveEditors(editors?: string[]): string[] {
    if (editors === undefined) return [];
    if (
      !Array.isArray(editors) ||
      editors.some((email) => typeof email !== 'string' || email.trim() === '')
    ) {
      throw new Error(
        '[GasConfig] Invalid "editors": expected an array of non-empty email strings.',
      );
    }

    const normalised = editors.map((email) => email.trim().toLowerCase());
    const invalid = normalised.find(
      (email) => !_GAS_CONFIG_EMAIL_PATTERN.test(email),
    );
    if (invalid !== undefined) {
      throw new Error(
        `[GasConfig] Invalid "editors": "${invalid}" is not an email address.`,
      );
    }
    return [...new Set(normalised)];
  }

  /**
   * Validate every field of the schema and convert it to its client form.
   * Pure: nothing outside the schema is consulted. Server-only `validate`
   * functions are collected into `validators`.
   */
  private _resolveSchema(
    schema: S,
    groupIds: ReadonlySet<string>,
    validators: Map<string, (value: GasConfigValue) => string | null>,
  ): GasConfigClientField[] {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw new Error(
        '[GasConfig] Invalid "schema": expected an object of fields keyed by config key.',
      );
    }

    return Object.keys(schema).map((key) => {
      const field = this._resolveField(key, schema[key], groupIds);

      const validate = (schema[key] as { validate?: unknown }).validate;
      if (validate !== undefined) {
        validators.set(
          key,
          validate as (value: GasConfigValue) => string | null,
        );
      }
      return field;
    });
  }

  private _resolveField(
    key: string,
    definition: unknown,
    groupIds: ReadonlySet<string>,
  ): GasConfigClientField {
    if (!_GAS_CONFIG_KEY_PATTERN.test(key)) {
      throw new Error(
        `[GasConfig] Invalid config key "${key}": expected a letter followed by letters, digits, "_", "." or "-".`,
      );
    }
    if (
      !definition ||
      typeof definition !== 'object' ||
      Array.isArray(definition)
    ) {
      throw this._invalidField(key, 'expected a field object.');
    }

    const raw = definition as Record<string, unknown>;
    const type = raw.type as GasConfigFieldType;
    if (!_GAS_CONFIG_FIELD_TYPES.includes(type)) {
      throw this._invalidField(
        key,
        `unknown type "${String(raw.type)}". Expected one of: ${_GAS_CONFIG_FIELD_TYPES.join(', ')}.`,
      );
    }
    if (typeof raw.label !== 'string' || raw.label.trim() === '') {
      throw this._invalidField(key, '"label" is required.');
    }
    if (raw.required !== undefined && typeof raw.required !== 'boolean') {
      throw this._invalidField(key, '"required" must be a boolean.');
    }
    if (raw.validate !== undefined && typeof raw.validate !== 'function') {
      throw this._invalidField(key, '"validate" must be a function.');
    }

    const field: GasConfigClientField = {
      key,
      type,
      label: raw.label,
      required: raw.required === true,
      default: type === 'boolean' ? false : null,
    };

    for (const name of ['description', 'placeholder'] as const) {
      if (raw[name] === undefined) continue;
      if (typeof raw[name] !== 'string') {
        throw this._invalidField(key, `"${name}" must be a string.`);
      }
      field[name] = raw[name];
    }

    if (raw.group !== undefined) {
      if (typeof raw.group !== 'string' || !groupIds.has(raw.group)) {
        throw this._invalidField(
          key,
          `"group" references the undefined group "${String(raw.group)}".`,
        );
      }
      field.group = raw.group;
    }

    if (type === 'select') {
      field.options = this._resolveOptions(key, raw.options);
    }
    const rules = this._resolveRules(key, type, raw);
    if (Object.keys(rules).length > 0) field.rules = rules;

    this._applyDefault(field, raw.default);
    return field;
  }

  /** Validate the declarative rules of a field. */
  private _resolveRules(
    key: string,
    type: GasConfigFieldType,
    raw: Record<string, unknown>,
  ): GasConfigClientRules {
    const rules: GasConfigClientRules = {};

    if (type === 'string' || type === 'text' || type === 'url') {
      const { maxLength, pattern, patternMessage } = raw;

      if (maxLength !== undefined) {
        if (
          typeof maxLength !== 'number' ||
          !Number.isInteger(maxLength) ||
          maxLength < 0
        ) {
          throw this._invalidField(
            key,
            '"maxLength" must be a non-negative integer.',
          );
        }
        rules.maxLength = maxLength;
      }
      if (pattern !== undefined) {
        if (typeof pattern !== 'string') {
          throw this._invalidField(key, '"pattern" must be a string.');
        }
        try {
          new RegExp(pattern);
        } catch {
          throw this._invalidField(
            key,
            `"pattern" is not a valid regular expression: ${pattern}`,
          );
        }
        rules.pattern = pattern;
      }
      if (patternMessage !== undefined) {
        if (typeof patternMessage !== 'string') {
          throw this._invalidField(key, '"patternMessage" must be a string.');
        }
        rules.patternMessage = patternMessage;
      }
    }

    if (type === 'number') {
      const { min, max, integer } = raw;

      for (const [name, limit] of [
        ['min', min],
        ['max', max],
      ] as const) {
        if (limit === undefined) continue;
        if (typeof limit !== 'number' || !Number.isFinite(limit)) {
          throw this._invalidField(key, `"${name}" must be a finite number.`);
        }
        rules[name] = limit;
      }
      if (
        rules.min !== undefined &&
        rules.max !== undefined &&
        rules.min > rules.max
      ) {
        throw this._invalidField(key, '"min" must not be greater than "max".');
      }
      if (integer !== undefined) {
        if (typeof integer !== 'boolean') {
          throw this._invalidField(key, '"integer" must be a boolean.');
        }
        rules.integer = integer;
      }
    }

    return rules;
  }

  /** Validate and copy the options of a `select` field. */
  private _resolveOptions(key: string, options: unknown): GasConfigOption[] {
    if (!Array.isArray(options) || options.length === 0) {
      throw this._invalidField(
        key,
        'a "select" field needs a non-empty "options" array.',
      );
    }

    const values = new Set<string>();
    return options.map((option: unknown) => {
      const { value, label } = (option ?? {}) as Record<string, unknown>;

      if (
        typeof value !== 'string' ||
        value === '' ||
        typeof label !== 'string'
      ) {
        throw this._invalidField(
          key,
          'every option needs a non-empty string "value" and a string "label".',
        );
      }
      if (values.has(value)) {
        throw this._invalidField(key, `duplicate option value "${value}".`);
      }
      values.add(value);
      return { value, label };
    });
  }

  /**
   * Set the default of a field. Empty defaults are allowed, as a required
   * field is simply invalid until filled; a non-empty one must satisfy the
   * field's own type and declarative rules.
   */
  private _applyDefault(field: GasConfigClientField, value: unknown): void {
    if (field.type === 'boolean') {
      if (value !== undefined && typeof value !== 'boolean') {
        throw this._invalidField(field.key, '"default" must be a boolean.');
      }
      field.default = value ?? false;
      return;
    }

    if (value === undefined || value === null || value === '') return;

    const message = _GasConfigStorage.check(field, value);
    if (message) {
      throw this._invalidField(field.key, `"default" is invalid: ${message}.`);
    }
    field.default = value as GasConfigValue;
  }

  private _invalidField(key: string, reason: string): Error {
    return new Error(`[GasConfig] Invalid field "${key}": ${reason}`);
  }

  /**
   * Validate a lockService, falling back to the library default when omitted.
   */
  private _resolveLockService(
    lockService?: GasConfigLockService,
  ): GasConfigLockService {
    if (lockService === undefined) return _GAS_CONFIG_DEFAULT_LOCK_SERVICE;

    if (!lockService || typeof lockService.withLock !== 'function') {
      throw new Error(
        '[GasConfig] Invalid "lockService": expected an object exposing withLock(scope, callback, options?) — e.g. GasLock. Passing the LockService global from Apps Script rather than GasLock (or a withLock wrapper) is the usual cause.',
      );
    }

    return lockService;
  }

  /**
   * Validate a lock timeout in milliseconds, falling back to the library
   * default when omitted.
   */
  private _resolveLockTimeoutMs(lockTimeoutMs?: number): number {
    if (lockTimeoutMs === undefined) return _GAS_CONFIG_DEFAULT_LOCK_TIMEOUT_MS;

    if (
      typeof lockTimeoutMs !== 'number' ||
      !Number.isFinite(lockTimeoutMs) ||
      lockTimeoutMs <= 0
    ) {
      throw new Error(
        `[GasConfig] Invalid "lockTimeoutMs": ${String(lockTimeoutMs)}. Expected a positive, finite number of milliseconds.`,
      );
    }

    return lockTimeoutMs;
  }

  /** Validate a logger, falling back to the library default when omitted. */
  private _resolveLogger(logger?: GasConfigLogger): GasConfigLogger {
    if (logger === undefined) return _GAS_CONFIG_DEFAULT_LOGGER;

    if (
      !logger ||
      typeof logger.info !== 'function' ||
      typeof logger.warn !== 'function'
    ) {
      throw new Error(
        '[GasConfig] Invalid "logger": expected an object exposing info(msg, meta?) and warn(msg, meta?) — e.g. a GasLogger instance, or console. Passing the GasLogger class rather than an instance is the usual cause.',
      );
    }

    return logger;
  }
}
