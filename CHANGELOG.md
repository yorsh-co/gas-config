# Changelog

All notable changes to this project will be documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
