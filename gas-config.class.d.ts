/**
 * Centralized configuration service for runtime config access,
 * validation, caching, and persistence.
 */
declare class GasConfig<TSchema extends GasConfigSchema> {
  static readonly presets: Readonly<{
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
  private readonly _schema;
  private readonly _storage;
  private _cache;
  constructor({
    schema,
    sheetName,
    gasSheetDbConfig,
  }: GasConfigOptions<TSchema>);
  /**
   * Load configuration values into memory.
   *
   * Values are cached after first load unless `force` is explicitly enabled.
   *
   * Missing schema values are automatically populated using schema defaults.
   */
  load(options?: { force?: boolean }): void;
  /**
   * Retrieve a configuration value by key.
   */
  get<TKey extends keyof TSchema>(key: TKey): TSchema[TKey]['default'];
  /**
   * Persist a configuration value.
   *
   * The value is validated against the schema before being written to storage.
   */
  set<TKey extends keyof TSchema>(
    key: TKey,
    value: TSchema[TKey]['default'],
  ): void;
  /**
   * Persist cached configuration values to storage.
   */
  save(): void;
  /**
   * Synchronize schema definitions with storage.
   */
  syncSchema(): void;
  /**
   * Return the in-memory cache, loading it first if necessary.
   */
  private _getCache;
}
