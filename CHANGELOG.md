# Changelog

---

## [Unreleased]

### Breaking

- gas-config 2.0 replaces the sheet-backed 1.x API. Configuration is a typed schema over Script Properties, with no `.config` sheet, no presets and no migration path from 1.x
- `GasConfig` takes `{ schema, groups?, editors?, title?, description?, logger?, lockService?, lockTimeoutMs? }`. The 1.x options (`gasSheetDbConfig`, `sheetName`) and `GasConfig.presets` are removed
- `get(key)` is typed by the schema field: `string | null`, `number | null` or `boolean`, with booleans never null. An unknown key throws `[GasConfig] Unknown config key: <key>`
- `load()`, `save()`, `syncSchema()` and `set()` are removed. Values are written by the settings UI, through an internal save that validates every change and detects conflicts
- gas-sheetdb is no longer a dependency. The optional peers are `gas-lock` (`^1.2.0`), `gas-error` (`^1.2.0`) and `gas-logger` (`^1.3.0`)
- Errors carry a `[GasConfig]` prefix and, for expected failures, `statusCode`, `code` and `details`: gas-error classes when it is loaded, otherwise a `GasConfigError`

### Added

- `editors` allowlist: emails are trimmed, lowercased, deduplicated and validated as email-shaped, and compared case-insensitively with `Session.getActiveUser().getEmail()`. Omitted or empty means nobody can edit. It is a guard for UI users, not a security boundary: anyone who can edit the script can read and change Script Properties
- Saves are authorized before the lock is taken or anything is read. An unidentifiable user (Session throws or returns an empty email) and an unlisted user are 401s reading `[GasConfig] Unable to identify the signed-in user` and `[GasConfig] Not authorized`, as gas-webapp's auth middleware, and neither message contains the email; they are `GasUnauthorizedError` when gas-error is loaded, otherwise a `GasConfigError` with status 401 and code `UNAUTHORIZED`
- Session is read lazily, once per instance. `get()` and `getAll()` are never gated, so non-editors get a read-only view. Requires the `https://www.googleapis.com/auth/userinfo.email` scope
- Schema types `string`, `text`, `url`, `select`, `date`, `number` and `boolean`, discriminated on `type`, so `type` constrains `default` and unknown keys are type errors
- Declarative rules `required`, `min`, `max`, `integer`, `maxLength`, `pattern` with `patternMessage` and `options`, plus a server-only `validate(value)` that returns an error message
- Schema validation in the constructor, throwing `[GasConfig]` errors for malformed keys, types, labels, groups, options, rules and defaults. Nothing touches an Apps Script service until first use
- `GasConfigValidation` (`src/shared/`), the pure rule set the settings UI and the server share, ported from the approved prototype with the same messages
- Script Properties storage (`gasConfig:<key>`, JSON-encoded): one `getProperties()` per instance, saves under the script lock (GasLock when loaded, otherwise LockService) that re-read the properties, write only the changed keys and stamp a new version
- Conflict detection through the stored version, and replay of a repeated `saveId` instead of a false conflict, for the `google.script.run` calls that are silently dropped
- An invalid stored value reads as the field default and logs a warning that names the key and never the value; it never makes other keys unreadable
- `GasConfigError` and `_GasConfigErrors`, with the codes `VALIDATION_ERROR`, `CONFLICT` and `UNAUTHORIZED`
- Wire types for the settings UI contract (`GasConfigSettingsState`, `GasConfigClientField`, `GasConfigSaveRequest`, `GasConfigSaveResponse`, `GasConfigRpcRequest`) in `src/shared/gas-config.contract.types.ts`
- Canonical peer declarations for gas-lock, gas-error and gas-logger under `src/internal/`
- Vitest suites over fakes of `PropertiesService`, `LockService`, `Utilities` and `console`, covering every validation rule, the schema checks, reads, saves, locking and the 1.x defects the plan lists, and a compile-time check of the schema and `get()` types (`test/gas-config.types-check.ts`)
- The settings UI in `src/web/`: a schema-driven sidebar, dialog and web page with Workspace and Yorsh themes, ported from the approved prototype. It is written as `.html`, `.css` and TypeScript, and built by `gas-dev-config html` into the committed `src/generated/gas-config.ui.html.ts` (`_GAS_CONFIG_UI_HTML`), which is listed in `loadOrder`
- The UI validates with the shared `GasConfigValidation`, reads its `surface`, `theme`, brand colour and initial state from a `#gas-config-bootstrap` JSON element (rendering the embedded state with no `getSettings` call), and shows keys flagged in the new optional `invalid` list of the settings state as errors from the first render
- Saves carry a fresh `saveId`. A save that times out is retried once with the same `saveId` (`Couldn't confirm the save. Retrying…`), then offers `Try again` (`Your changes may not have been saved. Try again to check.`). An `UNAUTHORIZED` failure switches the UI to read-only. Non-editors see `Only listed editors can change these settings.`
- `GasConfigRpcClient` (`src/web/gas-config.rpc.ts`): a promise wrapper over `google.script.run.GasConfigRpc` with a per-call timeout (30 s by default, code `CLIENT_TIMEOUT`) that parses the server's JSON error envelope into a failure carrying `status` and `code`; plus `GasConfigErrorEnvelope`, `GasConfigBootstrap`, `GasConfigSurface` and `GasConfigTheme` in the contract types
- `dev/`: a development harness that hosts the real UI in an imitation of each Workspace surface, a mock server that implements `GasConfigRpc` with failure scenarios (`unauthorized`, `timeout`, `timeout-twice` and `stored-invalid` among them), and `npm run dev`, a dependency-free server that transpiles the browser TypeScript on request; none of it is part of the release
- Vitest tests for the RPC client and the bootstrap reader over a fake `google.script.run`, and for the generated page, and Playwright end-to-end tests (`npm run test:e2e`, not part of `npm run check`) over the harness

### Changed

- Prettier, TypeScript and ESLint are now shared through [`gas-dev-config`](https://github.com/yorsh-co/gas-dev-config): `.prettierrc.json` is replaced by a `prettier` key in `package.json`, `tsconfig.json` extends the `gas` preset (target ES2020, previously ES2021) and `eslint.config.js` uses `gasEslint()`, keeping the `dev/` browser scripts linted
- Releases are published with [`gas-dev-release`](https://github.com/yorsh-co/gas-dev-release) instead of `scripts/release.sh`
- `npm run check` now also runs the tests and `gas-dev-config check`, and `typecheck` also checks `tsconfig.test.json`
- `gas-dev-config` is now `^1.6.0`, for the `html` command. `build` runs `build:frontend` (`gas-dev-config html`) then `build:backend` (`tsc -p tsconfig.json`), `typecheck` also checks `tsconfig.frontend.json` and `tsconfig.e2e.json`, and `eslint.config.js` lints `src/web/` as browser code. `tsconfig.frontend.json` emits nothing: the `html` command transpiles the browser sources itself
- Added `.github/dependabot.yml`: one weekly grouped pull request for development dependencies, against `develop`
- Added `gasDevConfig.loadOrder` to `package.json`, and Vitest suites that evaluate the sources in that order
- `src/internal/gas-config.peer.types.ts` is renamed to `.d.ts` so the ambient declarations emit nothing into `dist/`
- Updated transitive dev dependencies with `npm audit fix`, resolving the high-severity `brace-expansion` advisory

### Removed

- The 1.x sources (`gas-config.presets.ts`, `gas-config.validator.ts`, the sheet-backed class, storage and types), the stale gas-sheetdb declarations and the 1.x load test
- `scripts/release.sh` and `scripts/write-release-package-json.js`
- `prototype/`: its UI is now `src/web/`, its validation is `src/shared/gas-config.validation.ts`, and the harness and mock server moved to `dev/`
- The `@eslint/js`, `typescript-eslint` and `eslint-config-prettier` dev dependencies, now provided by `gas-dev-config`

---

## [1.2.1] - 2026-08-06

### Docs

- Correct the file push order in `#setup-instructions-with-clasp` in README.md

---

## [1.2.0] - 2026-07-24

### Changed

- Migrated the library implementation from JavaScript to TypeScript with no functional changes
- Replaced JSDoc-based type definitions with native TypeScript declarations

### Build

- Added release tooling to publish a consumer-facing `dist` branch
- Added automatic generation of a minimal release `package.json` for published builds

---

## [1.1.1] - 2026-07-22

### Changed

- Bump `gas-sheetdb` version number to v1.0.1 to match latest version which includes an important bug fix.

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
