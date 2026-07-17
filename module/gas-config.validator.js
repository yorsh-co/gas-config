/**
 * Internal schema and configuration validation helpers.
 */
const _GasConfigValidator = (() => {
  /**
   * Validate a single configuration entry.
   *
   * @param {string} key
   * @param {GasConfigValue} value
   * @param {GasConfigSchema} schema
   */
  const validateEntry = (key, value, schema) => {
    const meta = schema[key];

    if (!meta) throw new Error(`Unknown config key: ${key}`);

    if (_isMissing(value, meta))
      throw new Error(`Missing required config value: ${key}`);

    if (_isInvalid(value, meta))
      throw new Error(`Invalid config value: ${key}`);
  };

  /**
   * Validate all configuration entries.
   *
   * @param {GasConfigData} data
   * @param {GasConfigSchema} schema
   */
  const validateEntries = (data, schema) => {
    const unknown = [];

    Object.keys(data).forEach((key) => {
      if (!schema[key]) unknown.push(key);
    });

    if (unknown.length) {
      console.error(
        `[_GasConfigValidator] Unknown config keys: ${unknown.join(', ')}`,
      );
    }

    const missing = [];
    const invalid = [];

    Object.entries(schema).forEach(([key, meta]) => {
      const value = data?.[key];

      if (_isMissing(value, meta)) {
        missing.push(key);
        return;
      }

      if (_isInvalid(value, meta)) invalid.push(key);
    });

    if (missing.length) {
      throw new Error(`Missing required config values: ${missing.join(', ')}`);
    }

    if (invalid.length) {
      throw new Error(`Invalid config values: ${invalid.join(', ')}`);
    }
  };

  /**
   * Validate schema structure and defaults.
   *
   * @param {GasConfigSchema} schema
   */
  const validateSchema = (schema) => {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Config schema must be an object');
    }

    Object.entries(schema).forEach(([key, meta]) => {
      // Validate the schema entry
      if (!meta || typeof meta !== 'object') {
        throw new Error(`Invalid schema entry for "${key}"`);
      }

      // Validate the type
      if (!SUPPORTED_CONFIG_VALUE_TYPES.has(meta.type)) {
        throw new Error(
          `Unsupported type "${meta.type}" for "${key}". Supported types: ${Array.from(SUPPORTED_CONFIG_VALUE_TYPES).join(', ')}`,
        );
      }

      // Validate the 'required' property
      if (typeof meta.required !== 'boolean') {
        throw new Error(`"required" must be boolean for "${key}"`);
      }

      // Validate the validator
      if (meta.validate && typeof meta.validate !== 'function') {
        throw new Error(`"validate" must be function for "${key}"`);
      }

      // Validate the default value
      if (_isMissing(meta.default, meta)) {
        throw new Error(`Required config "${key}" must define a default value`);
      }

      if (_isInvalid(meta.default, meta)) {
        throw new Error(`Invalid default value for "${key}"`);
      }

      // Validate the example
      if (meta.example !== undefined && typeof meta.example !== meta.type) {
        throw new Error(`"example" type mismatch for "${key}"`);
      }
    });
  };

  /**
   * @param {string} key
   * @param {*} value
   * @param {GasConfigSchemaEntry} meta
   * @returns {boolean}
   */
  const _isInvalid = (value, meta) => {
    if (!meta) return true;

    if (meta.type && typeof value !== meta.type) return true;

    if (meta.validate && !meta.validate(value)) return true;

    return false;
  };

  /**
   * @param {string} key
   * @param {*} value
   * @param {GasConfigSchemaEntry} meta
   * @returns {boolean}
   */
  const _isMissing = (value, meta) => {
    const valueIsEmpty = value === '' || value === null || value === undefined;

    if (valueIsEmpty && !meta?.required) return false;

    if (valueIsEmpty) return true;

    return false;
  };

  return Object.freeze({
    validateEntry,
    validateEntries,
    validateSchema,
  });
})();
