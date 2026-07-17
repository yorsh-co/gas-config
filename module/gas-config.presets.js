GasConfig.presets = Object.freeze({
  locale: {
    type: 'string',
    required: true,
    label: 'Locale',
    default: 'en-GB',
    description:
      'Define the language and region used to format dates, numbers and text. Accepts IETF BCP 47 locale codes.',
    example: 'en-GB',
    validate: (value) =>
      typeof value === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(value),
  },
  enableSync: {
    type: 'boolean',
    required: true,
    label: 'Enable Sync',
    default: false,
    description: 'Toggle timed synchronization',
    example: true,
    validate: (value) => typeof value === 'boolean',
  },
});

/**
 * Supported configuration value types.
 *
 * Although complex value types like json and array are supported by `gas-sheetdb`
 * through encoding, their use is discouraged to allow direct editing
 * of the .config sheet without the risk of malformed configuration data.
 *
 * @type {Set<GasConfigValueType>}
 */
const SUPPORTED_CONFIG_VALUE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object', // Prefer date objects only
]);
