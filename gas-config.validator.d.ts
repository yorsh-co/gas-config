/**
 * Internal schema and configuration validation helpers.
 */
declare const _GasConfigValidator: Readonly<{
  validateEntry: (
    key: string,
    value: GasConfigValue,
    schema: GasConfigSchema,
  ) => void;
  validateEntries: (data: GasConfigData, schema: GasConfigSchema) => void;
  validateSchema: (schema: GasConfigSchema) => void;
}>;
