/**
 * Add config entries to this schema for use in the project.
 * New values are pushed to the config storage when
 * `Config.syncSchema()` is run.
 *
 * Call `Config.syncSchema()` from your init
 * script.
 *
 * @type {ConfigSchema}
 */
const CONFIG_SCHEMA = Object.freeze({
  'system.locale': {
    type: 'string',
    required: true,
    label: 'Locale',
    default: 'en-GB',
    description:
      'Define the language and region used to format dates, numbers and text. Accepts IETF BCP 47 locale codes.',
    example: 'en-GB',

    validate: (value) => {
      if (typeof value !== 'string') return false;
      return /^[a-z]{2}-[A-Z]{2}$/.test(value);
    },
  },
  'feature.enableSync': {
    type: 'boolean',
    required: true,
    label: 'Enable Sync',
    default: true,
    description: 'Toggle timed synchronization',
    example: true,
  },
});

/**
 * Optionally, update this typedef with keys added to CONFIG_SCHEMA
 * for autocomplete suggestions in your IDE when using
 * `Config.set()` and `Config.get()`.
 * @typedef {
 *  'system.locale' |
 *  'feature.enableSync'
 * } ConfigKey
 */

/**
 * Supported configuration value types.
 *
 * Although complex value types like json and array are supported by `gas-sheetdb`
 * through encoding, their use is discouraged in CONFIG_SCHEMA to allow direct editing
 * of the .config sheet without the risk of malformed configuration data.
 *
 * @type {Set<ConfigValueType>}
 */
const SUPPORTED_CONFIG_VALUE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object', // Prefer date objects only
]);
