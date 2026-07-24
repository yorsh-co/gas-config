/**
 * Built-in configuration schema presets. Assigned onto `GasConfig.presets`
 * by `gas-config.class.ts` (kept in this module, rather than assigning
 * directly, to avoid a circular import between this file and the class).
 */
declare const GasConfigPresets: Readonly<{
  locale: {
    type: 'string';
    required: true;
    label: string;
    default: string;
    description: string;
    example: string;
    validate: (value: GasConfigValue) => boolean;
  };
  enableSync: {
    type: 'boolean';
    required: true;
    label: string;
    default: false;
    description: string;
    example: true;
    validate: (value: GasConfigValue) => value is boolean;
  };
}>;
/**
 * Supported configuration value types.
 *
 * Although complex value types like json and array are supported by `gas-sheetdb`
 * through encoding, their use is discouraged to allow direct editing
 * of the .config sheet without the risk of malformed configuration data.
 */
declare const SUPPORTED_CONFIG_VALUE_TYPES: ReadonlySet<GasConfigValueType>;
