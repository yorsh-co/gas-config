/**
 * Centralized configuration service for runtime config access,
 * validation, caching, and persistence.
 */
const Config = (() => {
  /** @type {ConfigCache} */
  let cache = null;

  /** @type {ConfigSchema} */
  const schema = CONFIG_SCHEMA;

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
  const load = (options = {}) => {
    const { force = false } = options;

    if (!force && cache !== null) {
      return;
    }

    const stored = _ConfigStorage.load();

    cache = new Map(Object.entries(stored));

    Object.entries(schema).forEach(([key, meta]) => {
      if (cache.has(key)) return;

      cache.set(key, meta.default);
    });

    _ConfigValidator.validateEntries(Object.fromEntries(cache), schema);
  };

  /**
   * Retrieve a configuration value by key.
   *
   * @param {ConfigKey} key
   *
   * @returns {ConfigValue}
   */
  const get = (key) => {
    load();
    return cache.get(key);
  };

  /**
   * Persist a configuration value.
   *
   * The value is validated against the schema
   * before being written to storage.
   *
   * @param {ConfigKey} key
   * @param {ConfigValue} value
   */
  const set = (key, value) => {
    _ConfigValidator.validateEntry(key, value, schema);

    load();

    cache.set(key, value);

    save();
  };

  /**
   * Persist cached configuration values to storage.
   */
  const save = () => {
    load();

    const data = Object.fromEntries(cache);

    _ConfigStorage.save(data);
  };

  /**
   * Synchronize schema definitions with storage.
   *
   * Missing entries are created automatically
   * using schema default values.
   */
  const syncSchema = () => {
    _ConfigValidator.validateSchema(schema);

    _ConfigStorage.syncSchema(schema);

    load({ force: true });
  };

  return Object.freeze({
    load,
    get,
    set,
    save,
    syncSchema,
  });
})();
