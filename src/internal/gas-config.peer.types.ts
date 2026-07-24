/**
 * Ambient declarations for the `gas-sheetdb` library.
 *
 * `gas-sheetdb` is not yet written in TypeScript. In the Apps Script
 * runtime all script files are concatenated into a single global
 * scope, so these globals are available without an import today.
 */

interface GasSheetDbConfig {
  spreadsheet?: GoogleAppsScript.Spreadsheet.Spreadsheet;
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  useActiveSpreadsheet?: boolean;
  rowNumbers?: { columnKeys: number; firstDataRow: number };
}

interface SheetTable<T extends { key: string }> {
  find(): T[];
  updateMany(rows: T[]): void;
  insertMany(rows: Array<Partial<T> & Pick<T, 'key'>>): void;
}

declare class GasSheetDb {
  constructor(config: GasSheetDbConfig);
  table<T extends { key: string }>(options: {
    sheetName: string;
  }): SheetTable<T>;
}
