/**
 * Spreadsheet-backed persistence layer for configuration data.
 */
const _ConfigStorage = (() => {
  const SHEET_NAME = '.config';

  /**
   * @type {SheetTable|null}
   * From `SheetDb`.
   */
  let table = null;

  /**
   * Lazily initialize the config sheet table reference.
   */
  const _loadTable = () => {
    if (!table) {
      table = SheetDb.table(SHEET_NAME);
    }
  };

  /**
   * Load persisted configuration entries from storage.
   *
   * @returns {ConfigData}
   */
  const load = () => {
    _loadTable();

    /** @type {ConfigTableEntry[]} */
    const entries = table.find();

    const data = {};

    entries.forEach((entry) => {
      const { key, value } = entry;

      data[key] = value;
    });

    return data;
  };

  /**
   * @param {object} data
   */
  const save = (data) => {
    _loadTable();

    /** @type {ConfigTableEntry[]} */
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
  };

  /**
   * Synchronize schema entries from `CONFIG_SCHEMA` with persistent storage.
   *
   * @param {ConfigSchema} schema
   */
  const syncSchema = (schema) => {
    _loadTable();

    /** @type {ConfigTableEntry[]} */
    const existingEntries = table.find();

    const existingEntriesMap = new Map(
      existingEntries.map((entry) => [entry.key, entry]),
    );

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
      table.updateMany(updates);
    }

    if (inserts.length) {
      table.insertMany(inserts);
    }
  };

  return Object.freeze({
    load,
    save,
    syncSchema,
  });
})();
