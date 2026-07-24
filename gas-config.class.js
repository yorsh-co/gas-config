'use strict';
/**
 * Centralized configuration service for runtime config access,
 * validation, caching, and persistence.
 */
class GasConfig {
  constructor({ schema, sheetName = '.config', gasSheetDbConfig }) {
    _GasConfigValidator.validateSchema(schema);
    this._schema = Object.freeze({ ...schema });
    this._storage = new _GasConfigStorage(gasSheetDbConfig, sheetName);
    this._cache = null;
  }
  /**
   * Load configuration values into memory.
   *
   * Values are cached after first load unless `force` is explicitly enabled.
   *
   * Missing schema values are automatically populated using schema defaults.
   */
  load(options = {}) {
    const { force = false } = options;
    if (!force && this._cache !== null) {
      return;
    }
    const stored = this._storage.load();
    const cache = new Map(Object.entries(stored));
    Object.entries(this._schema).forEach(([key, meta]) => {
      if (cache.has(key)) return;
      cache.set(key, meta.default);
    });
    _GasConfigValidator.validateEntries(
      Object.fromEntries(cache),
      this._schema,
    );
    this._cache = cache;
  }
  /**
   * Retrieve a configuration value by key.
   */
  get(key) {
    return this._getCache().get(key);
  }
  /**
   * Persist a configuration value.
   *
   * The value is validated against the schema before being written to storage.
   */
  set(key, value) {
    _GasConfigValidator.validateEntry(key, value, this._schema);
    this._getCache().set(key, value);
    this.save();
  }
  /**
   * Persist cached configuration values to storage.
   */
  save() {
    const data = Object.fromEntries(this._getCache());
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
  /**
   * Return the in-memory cache, loading it first if necessary.
   */
  _getCache() {
    this.load();
    if (this._cache === null) {
      throw new Error('Config cache failed to initialize');
    }
    return this._cache;
  }
}
GasConfig.presets = GasConfigPresets;
