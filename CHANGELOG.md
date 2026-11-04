# Changelog

---

## [Unreleased]

### Changed

- Peer type declarations are synced with `gas-dev-config peers sync`; the `peers:check` script was added
- Requires `gas-dev-config` `^1.10.0`
- The peer declarations' usage header points consumers at `gas-dev-config peers sync` instead of a manual copy

---

## [2.0.3] - 2026-11-04

### Added

- README shows screenshots of the settings UI: dialog, sidebar, web page, theming, validation and read-only states

---

## [2.0.2] - 2026-11-04

### Changed

- Requires `gas-dev-release` `^1.3.0`, whose release preflight checks that the peer declarations' `@version` header matches `package.json`
- Requires `gas-dev-config` `^1.9.0`
- `.prettierignore` lists `.claude/worktrees`, `.claude/plans` and `.claude/handoff`, as required by `gas-dev-config check`

### Fixed

- The peer declarations' `@version` header now matches the package version (2.0.1). The vendored `gas-lock`, `gas-error` and `gas-logger` peer declarations are re-copied from gas-lock 1.2.2, gas-error 1.2.3 and gas-logger 2.0.2

---

## [2.0.1] - 2026-11-04

### Changed

- Releases also publish the GitHub Release for `vX.Y.Z` (`gasDevRelease.githubRelease`); `gas-dev-release` dev dependency bumped to `^1.2.1`

---

## [2.0.0] - 2026-11-03

gas-config 2.0 replaces the sheet-backed 1.x library with a typed schema over Script Properties and a settings UI for Sheets, Docs, Slides, Forms and web apps. The old API is gone and there is no migration path; the README documents the new one.

### Breaking

- Configuration is a typed schema stored in Script Properties. There is no `.config` sheet, no presets and no migration from 1.x
- `GasConfig` takes `{ schema, groups?, editors?, title?, appName?, description?, theme?, brand?, logger?, lockService?, lockTimeoutMs? }`. The `gasSheetDbConfig` and `sheetName` options and `GasConfig.presets` are removed
- `get(key)` is typed by the schema field: `string | null`, `number | null` or `boolean`, with booleans never null. An unknown key throws `[GasConfig] Unknown config key: <key>`
- `load()`, `save()`, `syncSchema()` and `set()` are removed. The settings UI writes values through a save that validates every change and detects conflicts
- gas-sheetdb is no longer a dependency. The optional peers are `gas-lock` (`^1.2.0`), `gas-error` (`^1.2.2`) and `gas-logger` (`^2.0.1`)
- Errors carry a `[GasConfig]` prefix. Expected failures carry `statusCode`, `code` and `details`, as gas-error classes when it is loaded and otherwise as a `GasConfigError`
- The consumer needs the `https://www.googleapis.com/auth/userinfo.email` scope to identify the signed-in user, and `https://www.googleapis.com/auth/script.container.ui` for the dialog and sidebar. Apps Script detects both from the code

### Added

- **Schema.** Field types `string`, `text`, `url`, `select`, `date`, `number` and `boolean`, discriminated on `type`, so `type` constrains `default` and unknown keys are type errors. Declarative rules `required`, `min`, `max`, `integer`, `maxLength`, `pattern` with `patternMessage`, and `options`, plus a server-only `validate(value)` that returns an error message. A constructor that validates keys, types, labels, groups, options, rules and defaults and throws `[GasConfig]` errors, touching no Apps Script service until first use
- **Settings UI.** A schema-driven page with `workspace` and `yorsh` themes, shown as a modal dialog (`showDialog`, 600 by 560 by default), the sidebar (`showSidebar`) or a web app page (`createHtmlOutput`, with the viewport meta tag added). The caller passes its own `Ui`, so the library names no document service and no consumer is asked for the scopes of services it does not use; a test scans the shipped code for them
- **Theming.** `theme` (`'workspace'` by default, or `'yorsh'`) and `brand` (`primaryColor` as `#rgb` or `#rrggbb`, `logoUrl` as an `https:` URL or a `data:image/` URI), validated in the constructor
- **Rendering.** The page is built with `HtmlService.createHtmlOutput`, never as a template, and embeds the settings state for the current user, so it renders with no `getSettings` call. `<`, U+2028 and U+2029 are escaped in the embedded JSON, so no stored value or title can close the script element
- **Access.** An `editors` allowlist: emails are trimmed, lowercased, deduplicated and validated as email-shaped, and compared case-insensitively with `Session.getActiveUser().getEmail()`. Omitted or empty means nobody can edit. Non-editors get a read-only view reading `Only listed editors can change these settings.`. `get()` and `getAll()` are never gated. Saves are authorized before the lock is taken or anything is read; an unidentifiable user and an unlisted user are 401s reading `[GasConfig] Unable to identify the signed-in user` and `[GasConfig] Not authorized`, as in gas-webapp's auth middleware, and neither message contains the email. The allowlist guards UI users and is not a security boundary: anyone who can edit the script can read and change Script Properties
- **Storage.** One JSON-encoded Script Property per key (`gasConfig:<key>`), read once per instance. A save re-reads the properties under the script lock (GasLock when loaded, otherwise LockService), validates every change, and writes only the changed keys and a new version stamp in one `setProperties` call
- **Conflicts and retries.** Conflict detection through the stored version, and replay of a repeated `saveId` instead of a false conflict, for the `google.script.run` calls that are silently dropped. A save that times out is retried once with the same `saveId` (`Couldn't confirm the save. Retrying…`), then offers `Try again` (`Your changes may not have been saved. Try again to check.`). An `UNAUTHORIZED` failure switches the UI to read-only
- **Invalid stored values.** A stored value that fails validation reads as the field default and logs a warning that names the key and never the value. It never makes other keys unreadable, and the UI shows the stored value flagged as an error from the first render
- **Entry point.** `GasConfigRpc(method, payload)`, a top-level function declaration that routes `getSettings` and `saveSettings` to the most recently constructed `GasConfig`, so the instance is declared once at global scope. An unknown method is a 400
- **Errors.** Failures throw `Error(JSON.stringify({ ok: false, status, code, error, details? }))`, the envelope of gas-webapp. Expected failures keep their status, code and message; anything else is a generic 500 `INTERNAL_ERROR`, and the real error goes to `logger.warn`. With gas-error loaded, `GasError.handle(err, { rethrow: false })` builds the envelope. `GasConfigError` and `_GasConfigErrors` carry the codes `VALIDATION_ERROR`, `UNAUTHORIZED` and `INTERNAL_ERROR`
- **Change log.** A successful save logs `[GasConfig] Settings changed` with the user and each key's old and new value through `logger.info`, after the lock is released. A logger that throws never breaks a save
- **Browser client.** `GasConfigRpcClient`, a promise wrapper over `google.script.run.GasConfigRpc` with a per-call timeout (30 s by default, code `CLIENT_TIMEOUT`) that parses the server's error envelope into a failure carrying `status` and `code`
- **Types.** The wire contract (`GasConfigSettingsState`, `GasConfigClientField`, `GasConfigSaveRequest`, `GasConfigSaveResponse`, `GasConfigRpcRequest`, `GasConfigErrorEnvelope`, `GasConfigBootstrap`) in `src/shared/gas-config.contract.types.ts`, and canonical peer declarations for gas-lock, gas-error and gas-logger under `src/internal/`
- **Peer type declarations.** `peer/gas-config.peer.types.d.ts`, the canonical ambient declaration of the public surface for downstream gas-\* libraries, type-checked standalone by `npm run typecheck:peer` and compared with `src/` by a Vitest test, so the two cannot drift
- **Build.** The UI is written as `.html`, `.css` and TypeScript in `src/web/` and built by `gas-dev-config html` into the committed `src/generated/gas-config.ui.html.ts` (`_GAS_CONFIG_UI_HTML`), which is listed in `gasDevConfig.loadOrder` and checked by `gas-dev-config check`
- **Tests.** Vitest suites over fakes of `PropertiesService`, `LockService`, `Utilities` and `console`, covering every validation rule, the schema checks, reads, saves, locking, the RPC client and the generated page, plus a compile-time check of the schema and `get()` types. Playwright end-to-end tests (`npm run test:e2e`, not part of `npm run check`) over the development harness. Apps Script tests (`npm run test:gas`, `npm run test:gas:build`) against a dedicated project: a real Script Properties round trip, the script lock, the `editors` check against the running account, the rendered page and its bootstrap, `GasConfigRpc` envelopes, an invalid stored value, and the real `GasError.handle` and `GasLogger` peers
- **Development tools.** `dev/`, a harness that hosts the real UI in an imitation of each Workspace surface with a mock server and failure scenarios (`npm run dev`), and `manual/`, a consumer fixture and checklist for container-bound Sheets, Docs, Slides and Forms scripts and a web app deployment (`npm run manual:build`). Neither is part of the release
- **App name and logo.** The `appName` option, shown above the page title and in the tab, and the yorsh logo in the dialog and sidebar
- A README written for 2.0, with a Platform limitations table, and `.github/dependabot.yml`: one weekly grouped pull request for development dependencies, against `develop`

### Changed

- Prettier, TypeScript and ESLint are shared through [`gas-dev-config`](https://github.com/yorsh-co/gas-dev-config) (`^1.6.0`, for the `html` command): the Prettier config is a key in `package.json`, `tsconfig.json` extends the `gas` preset (target ES2020, previously ES2021), and `eslint.config.js` uses `gasEslint()` and lints `src/web/` as browser code
- Releases are published with [`gas-dev-release`](https://github.com/yorsh-co/gas-dev-release) instead of `scripts/release.sh`
- `build` runs `build:frontend` (`gas-dev-config html`) then `build:backend`. `typecheck` also checks the tests, the browser sources, the peer declarations and the end-to-end tests, and `check` also runs the tests and `gas-dev-config check`
- The default logger no longer repeats the `[GasConfig]` prefix of a message that already starts with it
- Updated transitive dev dependencies with `npm audit fix`, resolving the high-severity `brace-expansion` advisory
- The peers are gas-logger `^2.0.1` and gas-error `^1.2.2`. The sheet sink of gas-logger 2.x takes the spreadsheet from the caller, so bundling it no longer adds the Sheets scope to Docs, Slides and Forms projects, and gas-error 1.2.2 accepts gas-logger 2.x without a peer warning

### Removed

- The 1.x sources (`gas-config.presets.ts`, `gas-config.validator.ts`, the sheet-backed class, storage and types), the stale gas-sheetdb declarations and the 1.x load test
- `scripts/release.sh`, `scripts/write-release-package-json.js` and the `@eslint/js`, `typescript-eslint` and `eslint-config-prettier` dev dependencies, now provided by `gas-dev-config`
- `prototype/`: its UI is now `src/web/`, its validation is `src/shared/gas-config.validation.ts`, and its harness and mock server live in `dev/`

### Fixed

- A required field may have an empty default: it is invalid until filled, not a schema error
- A save writes only the changed keys and never overwrites another key with a stale cached value
- `NaN` and `Infinity` are not numbers, and one invalid stored value no longer makes the other keys unreadable
- Inline padding on the page footer on narrow screens
- No pointer cursor on a disabled switch label
- The manual fixture now targets one host with `@OnlyCurrentDoc`, which narrows its consent scopes
- `npm run manual:build` fails if the bundled peers name a host service (`SpreadsheetApp`, `DocumentApp`, `SlidesApp`, `FormApp`), since Apps Script would add that service's scope to every fixture

### Docs

- The README gains a Platform notes section with what was observed on deployed projects, and the empty Results template is removed from `manual/README.md`

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
