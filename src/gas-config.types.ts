/**
 * Supported configuration value types.
 */
type GasConfigValueType = 'string' | 'number' | 'boolean' | 'object';

/**
 * A configuration value.
 */
type GasConfigValue = string | number | boolean | object;

/**
 * Schema definition for a single configuration key.
 */
interface GasConfigSchemaEntry<
  TDefault extends GasConfigValue = GasConfigValue,
> {
  type: GasConfigValueType;
  required: boolean;
  label: string;
  default: TDefault;
  description?: string | undefined;
  example?: GasConfigValue | undefined;
  validate?: ((value: GasConfigValue) => boolean) | undefined;
}

/**
 * Schema mapping configuration keys to their schema entry.
 */
type GasConfigSchema = Record<string, GasConfigSchemaEntry>;

/**
 * Persisted configuration data keyed by config key.
 */
type GasConfigData = Record<string, GasConfigValue>;

/**
 * In-memory cache of configuration values.
 */
type GasConfigCache = Map<string, GasConfigValue>;

/**
 * GasConfig constructor options.
 */
interface GasConfigOptions<TSchema extends GasConfigSchema> {
  schema: TSchema;
  sheetName?: string;
  gasSheetDbConfig: GasSheetDbConfig;
}

/**
 * Row persisted to the `.config` sheet table.
 *
 * NOTE: the original JSDoc typed `example` as `string`, but presets
 * (e.g. `enableSync.example: true`) use non-string examples too.
 * Typed as `GasConfigValue` here to match actual usage.
 */
interface GasConfigTableEntry {
  key: string;
  value: GasConfigValue;
  label: string;
  description?: string | undefined;
  example?: GasConfigValue | undefined;
  required: boolean;
  type: GasConfigValueType;
}

/**
 * A table entry as passed to `insertMany` — only `key` is guaranteed;
 * the rest of the schema metadata may be filled in later by `syncSchema`.
 */
type GasConfigTableEntryInsert = Partial<GasConfigTableEntry> &
  Pick<GasConfigTableEntry, 'key'>;
