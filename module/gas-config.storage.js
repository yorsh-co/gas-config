/**
 * Spreadsheet-backed persistence layer for configuration data.
 */
class _GasConfigStorage {
  /**
   * @param {string} sheetName
   */
  constructor(sheetName) {
    this._sheetName = sheetName;

    /** @type {SheetTable|null} */
    this._table = null;
  }

  /**
   * Lazily initialize the config sheet table reference.
   */
  _loadTable() {
    if (!this._table) {
      this._table = SheetDb.table(this._sheetName);
    }
  }

  /**
   * Load persisted configuration entries from storage.
   *
   * @returns {GasConfigData}
   */
  load() {
    this._loadTable();

    /** @type {GasConfigTableEntry[]} */
    const entries = this._table.find();

    const data = {};

    entries.forEach((entry) => {
      const { key, value } = entry;

      data[key] = value;
    });

    return data;
  }

  /**
   * @param {object} data
   */
  save(data) {
    this._loadTable();

    /** @type {GasConfigTableEntry[]} */
    const existingEntries = this._table.find();

    const existingEntriesMap = new Map(
      existingEntries.map((entry) => [entry.key, entry]),
    );

    const updates = [];
    const inserts = [];

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
      this._table.updateMany(updates);
    }

    if (inserts.length) {
      this._table.insertMany(inserts);
    }
  }

  /**
   * Synchronize schema entries from `CONFIG_SCHEMA` with persistent storage.
   *
   * @param {GasConfigSchema} schema
   */
  syncSchema(schema) {
    this._loadTable();

    /** @type {GasConfigTableEntry[]} */
    const existingEntries = this._table.find();

    const existingEntriesMap = new Map();
    for (const entry of existingEntries) {
      existingEntriesMap.set(entry.key, entry);
    }

    const updates = [];
    const inserts = [];

    Object.entries(schema).forEach(([key, meta]) => {
      const existingEntry = existingEntriesMap.get(key);

      if (existingEntry) {
        const value =
          existingEntry.value !== null &&
          existingEntry.value !== undefined &&
          existingEntry.value !== ''
            ? existingEntry.value
            : meta.default;

        updates.push({

          key,
          value,
          label: meta.label,
          description: meta.description,
          example: meta.example,
          required: meta.required,
          type: meta.type,
        });

        return;
      }

      inserts.push({
        key,
        value: meta.default,
        label: meta.label,
        description: meta.description,
        example: meta.example,
        required: meta.required,
        type: meta.type,
      });
    });

    if (updates.length) {
      this._table.updateMany(updates);
    }

    if (inserts.length) {
      this._table.insertMany(inserts);
    }
  }
}
