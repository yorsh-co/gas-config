# Changelog

All notable changes to this project will be documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.1.0] - 2026-07-20

### Changed

- **BREAKING:** Updated `gas-config` to support `gas-sheetdb` v1.0.0, replacing the legacy `SheetDb` singleton with an internally managed `GasSheetDb` instance
- **BREAKING:** `GasConfig` now accepts a `gasSheetDbConfig` constructor option, allowing the underlying `GasSheetDb` instance to be configured with a spreadsheet source (`spreadsheet`, `spreadsheetUrl`, `spreadsheetId`, or `useActiveSpreadsheet`) and optional row configuration

### Documentation

- Updated the README for `gas-sheetdb` v1.0.0, including the new class-based API and constructor examples
- Documented how to configure the underlying `GasSheetDb` instance through `gasSheetDbConfig`
- Documented the required `clasp` `filePushOrder` configuration when using `gas-config` alongside `gas-sheetdb`
- Updated all `git subtree` installation examples to reference `gas-sheetdb` v1.0.0
- Update all `git subtree` installation examples to reference `gas-config` v1.1.0

---

## [1.0.1] - 2026-07-20

### Changed

- Pinned the `gas-sheetdb` `git subtree` install instructions to tag `0.1.2` to pin current `gas-config` version with a compatible `gas-sheetdb` version before make the changes to support `gas-sheetdb:1.0.0` which contains breaking changes.

---

## [1.0.0] - 2026-07-17

### Changed

- **Breaking:** Replaced the `Config` singleton with an instantiable `GasConfig` class. Consumers now construct their own instance with `new GasConfig({ schema, sheetName })` instead of relying on a single global config bound to a hardcoded `.config` sheet.
- **Breaking:** Renamed all public and internal identifiers from `Config`/`_Config*` to `GasConfig`/`_GasConfig*` (`_ConfigStorage` → `_GasConfigStorage`, `_ConfigValidator` → `_GasConfigValidator`, `ConfigSchema`/`ConfigValue`/etc. typedefs → `GasConfig*`).
- **Breaking:** Replaced the monolithic `CONFIG_SCHEMA` (dotted keys like `system.locale`) with reusable `GasConfig.presets` entries (bare keys like `locale`, `enableSync`) that consumers spread into their own schema when constructing a `GasConfig` instance.
- Config storage now accepts a configurable sheet name via the constructor instead of a fixed `SHEET_NAME` constant, allowing multiple independently-configured `GasConfig` instances against different sheets.

### Fixed

- `syncSchema()` no longer crashes when syncing against an already-populated `.config` sheet. Update payloads were being rebuilt as fresh object literals containing only schema-derived fields, dropping the `_id`/`_createdAt` metadata that `SheetDb.updateMany` requires on entries returned from `find()`.

---

## [0.1.0] - 2026-05-26

Initial public release.

### Added

- Spreadsheet-backed configuration management for Google Apps Script projects
- `Config` service for centralized runtime configuration access
- Schema-driven configuration system using `CONFIG_SCHEMA`
- `.config` sheet storage with in-sheet editing support
- Automatic schema synchronization via `Config.syncSchema()`
- Automatic population of missing configuration entries using defaults
- Runtime validation during load, persistence, and schema synchronization
- In-memory configuration caching for reduced spreadsheet reads
- Type-preserving configuration values with support for:
  - `string`
  - `number`
  - `boolean`
  - `object`
- Required configuration enforcement
- Custom per-entry validation support
- Metadata-driven configuration entries with support for:
  - labels
  - descriptions
  - examples
  - required flags
  - type definitions
- Spreadsheet persistence powered by `gas-sheetdb`
- Lock-safe storage operations through `gas-sheetdb`
- IDE autocomplete support through `ConfigKey` typedef definitions
- Support for local Apps Script development workflows using `clasp` and git subtree

### Architecture

- Introduced schema-first configuration architecture
- Separated configuration responsibilities across service, validation, storage, schema, and type layers
- Added dedicated validation and storage abstractions through `_ConfigValidator` and `_ConfigStorage`
