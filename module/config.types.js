/**
 * @typedef {Object<ConfigKey, ConfigValue>} ConfigData
 */

/**
 * @typedef {Map<ConfigKey, ConfigValue>} ConfigCache
 */

/**
 * @typedef {Object<ConfigKey, ConfigSchemaEntry>} ConfigSchema
 */

/**
 * @typedef {Object} ConfigSchemaEntry
 * @property {ConfigValueType} type
 * @property {boolean} required
 * @property {string} label
 * @property {ConfigValue} default
 * @property {string} [description]
 * @property {ConfigValue} [example]
 * @property {(value:ConfigValue) => boolean} [validate]
 */

/**
 * @typedef {Object} ConfigTableEntry
 * @property {ConfigKey} key
 * @property {ConfigValue} value
 * @property {string} label
 * @property {string} [description]
 * @property {string} [example]
 * @property {boolean} required
 * @property {ConfigValueType} type
 */

/**
 * @typedef {string|number|boolean|object} ConfigValue
 */

/**
 * @typedef {'string'|'number'|'boolean'|'object'} ConfigValueType
 */
