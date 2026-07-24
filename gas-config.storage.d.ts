/**
 * Spreadsheet-backed persistence layer for configuration data.
 */
declare class _GasConfigStorage {
  private readonly _sheetDb;
  private readonly _sheetName;
  private _table;
  constructor(gasSheetDbConfig: GasSheetDbConfig, sheetName: string);
  /**
   * Lazily initialize the config sheet table reference.
   */
  private _loadTable;
  /**
   * Build a table entry from schema metadata, only assigning the optional
   * `description`/`example` fields when present (required for
   * `exactOptionalPropertyTypes` — assigning `undefined` explicitly to an
   * optional property is a type error, so these are conditionally set).
   */
  private _buildTableEntry;
  /**
   * Load persisted configuration entries from storage.
   */
  load(): GasConfigData;
  save(data: GasConfigData): void;
  /**
   * Synchronize schema entries from the config schema with persistent storage.
   */
  syncSchema(schema: GasConfigSchema): void;
}
