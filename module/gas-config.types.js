/**
 * @typedef {Object<string, GasConfigValue>} GasConfigData
 */

/**
 * @typedef {Map<string, GasConfigValue>} GasConfigCache
 */

/**
 * @typedef {Object<string, GasConfigSchemaEntry>} GasConfigSchema
 */

/**
 * @typedef {Object} GasConfigSchemaEntry
 * @property {GasConfigValueType} type
 * @property {boolean} required
 * @property {string} label
 * @property {GasConfigValue} default
 * @property {string} [description]
 * @property {GasConfigValue} [example]
 * @property {(value:GasConfigValue) => boolean} [validate]
 */

/**
 * @typedef {Object} GasConfigTableEntry
 * @property {string} key
 * @property {GasConfigValue} value
 * @property {string} label
 * @property {string} [description]
 * @property {string} [example]
 * @property {boolean} required
 * @property {GasConfigValueType} type
 */

/**
 * @typedef {string|number|boolean|object} GasConfigValue
 */

/**
 * @typedef {'string'|'number'|'boolean'|'object'} GasConfigValueType
 */
