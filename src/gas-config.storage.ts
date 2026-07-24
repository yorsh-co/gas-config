/**
 * Spreadsheet-backed persistence layer for configuration data.
 */
class _GasConfigStorage {
  private readonly _sheetDb: GasSheetDb;
  private readonly _sheetName: string;
  private _table: SheetTable<GasConfigTableEntry> | null;

  constructor(gasSheetDbConfig: GasSheetDbConfig, sheetName: string) {
    this._sheetDb = new GasSheetDb(gasSheetDbConfig);
    this._sheetName = sheetName;
    this._table = null;
  }

  /**
   * Lazily initialize the config sheet table reference.
   */
  private _loadTable(): SheetTable<GasConfigTableEntry> {
    if (!this._table) {
      this._table = this._sheetDb.table<GasConfigTableEntry>({
        sheetName: this._sheetName,
      });
    }

    return this._table;
  }

  /**
   * Build a table entry from schema metadata, only assigning the optional
   * `description`/`example` fields when present (required for
   * `exactOptionalPropertyTypes` — assigning `undefined` explicitly to an
   * optional property is a type error, so these are conditionally set).
   */
  private _buildTableEntry(
    key: string,
    value: GasConfigValue,
    meta: GasConfigSchemaEntry,
    base: Partial<GasConfigTableEntry> = {},
  ): GasConfigTableEntry {
    const entry: GasConfigTableEntry = {
      ...base,
      key,
      value,
      label: meta.label,
      required: meta.required,
      type: meta.type,
    };

    if (meta.description !== undefined) entry.description = meta.description;
    if (meta.example !== undefined) entry.example = meta.example;

    return entry;
  }

  /**
   * Load persisted configuration entries from storage.
   */
  load(): GasConfigData {
    const table = this._loadTable();

    const entries = table.find();

    const data: GasConfigData = {};

    entries.forEach((entry) => {
      const { key, value } = entry;

      data[key] = value;
    });

    return data;
  }

  save(data: GasConfigData): void {
    const table = this._loadTable();

    const existingEntries = table.find();

    const existingEntriesMap = new Map(
      existingEntries.map((entry) => [entry.key, entry]),
    );

    const updates: GasConfigTableEntry[] = [];
    const inserts: GasConfigTableEntryInsert[] = [];

    Object.entries(data).forEach(([key, value]) => {
      const existingEntry = existingEntriesMap.get(key);

      if (existingEntry) {
        existingEntry.value = value;

        updates.push(existingEntry);
        return;
      }

      inserts.push({ key, value });
    });

    if (updates.length) {
      table.updateMany(updates);
    }

    if (inserts.length) {
      table.insertMany(inserts);
    }
  }

  /**
   * Synchronize schema entries from the config schema with persistent storage.
   */
  syncSchema(schema: GasConfigSchema): void {
    const table = this._loadTable();

    const existingEntries = table.find();

    const existingEntriesMap = new Map<string, GasConfigTableEntry>();
    for (const entry of existingEntries) {
      existingEntriesMap.set(entry.key, entry);
    }

    const updates: GasConfigTableEntry[] = [];
    const inserts: GasConfigTableEntry[] = [];

    Object.entries(schema).forEach(([key, meta]) => {
      const existingEntry = existingEntriesMap.get(key);

      if (existingEntry) {
        const value =
          existingEntry.value !== null &&
          existingEntry.value !== undefined &&
          existingEntry.value !== ''
            ? existingEntry.value
            : meta.default;

        updates.push(this._buildTableEntry(key, value, meta, existingEntry));
        return;
      }

      inserts.push(this._buildTableEntry(key, meta.default, meta));
    });

    if (updates.length) {
      table.updateMany(updates);
    }

    if (inserts.length) {
      table.insertMany(inserts);
    }
  }
}
