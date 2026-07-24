'use strict';
/**
 * Spreadsheet-backed persistence layer for configuration data.
 */
class _GasConfigStorage {
  constructor(gasSheetDbConfig, sheetName) {
    this._sheetDb = new GasSheetDb(gasSheetDbConfig);
    this._sheetName = sheetName;
    this._table = null;
  }
  /**
   * Lazily initialize the config sheet table reference.
   */
  _loadTable() {
    if (!this._table) {
      this._table = this._sheetDb.table({
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
  _buildTableEntry(key, value, meta, base = {}) {
    const entry = {
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
  load() {
    const table = this._loadTable();
    const entries = table.find();
    const data = {};
    entries.forEach((entry) => {
      const { key, value } = entry;
      data[key] = value;
    });
    return data;
  }
  save(data) {
    const table = this._loadTable();
    const existingEntries = table.find();
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
      table.updateMany(updates);
    }
    if (inserts.length) {
      table.insertMany(inserts);
    }
  }
  /**
   * Synchronize schema entries from the config schema with persistent storage.
   */
  syncSchema(schema) {
    const table = this._loadTable();
    const existingEntries = table.find();
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
