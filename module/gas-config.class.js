/**
 * Centralized configuration service for runtime config access,
 * validation, caching, and persistence.
 *
 * @template {GasConfigSchema} SchemaValues
 */
class GasConfig {
  /**
   * @param {Object} options
   * @param {GasConfigSchema} options.schema
   * @param {string} [options.sheetName = '.config']
   */
  constructor({ schema, sheetName = '.config' }) {
    _GasConfigValidator.validateSchema(schema);

    /** @type {SchemaValues} */
    this._schema = Object.freeze({ ...schema });

    /** @type {_GasConfigStorage} */
    this._storage = new _GasConfigStorage(sheetName);

    /** @type  {GasConfigCache|null} */
    this._cache = null;
  }

  /**
   * Load configuration values into memory.
   *
   * Values are cached after first load unless `force`
   * is explicitly enabled.
   *
   * Missing schema values are automatically populated
   * using schema defaults.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false]
   */
  load(options = {}) {
    const { force = false } = options;

    if (!force && this._cache !== null) {
      return;
    }

    const stored = this._storage.load();

    this._cache = new Map(Object.entries(stored));

    Object.entries(this._schema).forEach(([key, meta]) => {
      if (this._cache.has(key)) return;

      this._cache.set(key, meta.default);
    });

    _GasConfigValidator.validateEntries(
      Object.fromEntries(this._cache),
      this._schema,
    );
  }

  /**
   * Retrieve a configuration value by key.
   *
   * @template {keyof SchemaValues} SchemaKey
   * @param {SchemaKey} key
   *
   * @returns {SchemaValues[SchemaKey]['default']}
   */
  get(key) {
    this.load();
    return this._cache.get(key);
  }

  /**
   * Persist a configuration value.
   *
   * The value is validated against the schema
   * before being written to storage.
   *
   * @template {keyof SchemaValues} SchemaKey
   * @param {SchemaKey} key
   * @param {GasConfigValue} value
   */
  set(key, value) {
    _GasConfigValidator.validateEntry(key, value, this._schema);

    this.load();

    this._cache.set(key, value);

    this.save();
  }

  /**
   * Persist cached configuration values to storage.
   */
  save() {
    this.load();

    const data = Object.fromEntries(this._cache);

    this._storage.save(data);
  }

  /**
   * Synchronize schema definitions with storage.
   */
  syncSchema() {
    _GasConfigValidator.validateSchema(this._schema);

    this._storage.syncSchema(this._schema);

    this.load({ force: true });
  }
}
