# gas-config 2.0 plan

Status: draft, 2026-10-30. Blocked on the gas-webapp review (see [Dependency on gas-webapp](#dependency-on-gas-webapp)).

## Goal

Let a management team configure an Apps Script project from a user-friendly interface that feels native to Google Workspace, or carries the owner's business brand, never a third-party tool. Configuration holds values that change and help with setup. Secrets stay out of scope until [Secrets](#secrets) is decided.

## Decisions made

| Topic            | Decision                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Interface        | A schema-driven HtmlService UI. One stylesheet serves the sidebar (300px), the modal dialog and a full web page for standalone scripts   |
| Hosts            | Sheets, Docs, Slides and Forms through `getUi()`; standalone scripts through `doGet`                                                     |
| Look             | Two token sets: `workspace` (Material 3 as used in Workspace) and `yorsh` (from `yorsh/packages/brand`). Brand overrides set tokens only |
| Storage          | Script Properties. gas-sheetdb is no longer a dependency                                                                                 |
| Access           | A user allowlist                                                                                                                         |
| Local editing    | The UI is written as `.html`, `.css` and TypeScript files; a build step turns them into one string constant                              |
| Compatibility    | 2.0 starts clean. There are no external 1.x consumers, so there is no migration path from `.config` sheets                               |
| Visual direction | Approved from `prototype/` (merged into `develop` in `38bc596`)                                                                          |

## Architecture

```text
src/
  shared/gas-config.validation.ts   one rule set, run by the server and the browser
  gas-config.types.ts
  gas-config.storage.ts             Script Properties, lock, version stamp
  gas-config.access.ts              allowlist
  gas-config.ui.ts                  dialog, sidebar, web page, RPC entry point
  gas-config.class.ts
  web/  ui.html  ui.css  ui.ts      edited locally, as in the prototype
  generated/gas-config.ui.html.ts   written by the build step, never edited by hand
dev/  harness + mock server          local development and browser tests, not shipped
```

### Storage

- One property per key, `gasConfig:<key>`, JSON-encoded so types round-trip. A version stamp is stored alongside the values.
- One `getProperties()` call per execution, then served from memory. A missing key returns its default.
- Writes take the lock through GasLock when it is loaded, otherwise through LockService. Only changed keys are written.
- Limits: 9 KB per value and 500 KB per store, plus daily quotas on property reads and writes. None of them matter for configuration.

### Access

- `editors: string[]` in the constructor options, compared case-insensitively with `Session.getActiveUser().getEmail()`.
- An empty email, for example an account outside the domain, is refused with an explanation.
- Every RPC call is authorized on the server, not only opening the UI.
- This is a guard against UI users. Anyone who can edit the script can read and change Script Properties.
- The web page surface must be deployed with "Execute as: User accessing the web app", or the active user's email is not available.

### Server UI

- `showDialog()`, `showSidebar()`, and `createHtmlOutput()` for `doGet`.
- One public global, `GasConfigRpc`, routes the UI's calls. `google.script.run` only reaches top-level functions whose names do not end in `_`.
- Surface, theme, brand tokens and logo are passed through the HtmlService template with contextual escaping.
- An optional logger (GasLogger or `console`) records each change: who, key, old value, new value.

### Schema

- Types: `string`, `text`, `number`, `boolean`, `select`, `url`, `date`.
- Rules the browser also checks: `required`, `min`, `max`, `integer`, `maxLength`, `pattern` with `patternMessage`, `options`.
- Server-only check: `validate(value) => string | null`, which returns a message rather than a boolean so the UI can show it.
- Values cross `google.script.run` as JSON-safe types: dates as `'YYYY-MM-DD'`, empty values as `null`.

### Client/server contract

As implemented by the prototype (`prototype/README.md`):

- `getSettings()` returns `{ title, description?, canEdit, version, brand?, groups, fields, values }`.
- `saveSettings({ changes, version })` sends only the changed keys. It returns one of:
  - `{ ok: true, values, version }`
  - `{ ok: false, reason: 'invalid', errors }`
  - `{ ok: false, reason: 'conflict', version }`
  - or fails, for example when the user is not authorized.

## HTML build step

Requirements:

1. Browser code is edited as `.html`, `.css` and TypeScript files and runs locally against a mock server, as `prototype/` does today.
2. The build compiles the browser TypeScript (gas-dev-config `web.json` preset).
3. It inlines local `<link rel="stylesheet">` and `<script src>` into the HTML, escaping `</script>` in scripts. External URLs such as Google Fonts are left as they are.
4. It removes elements marked `data-dev-only`, such as the mock server.
5. It writes a `.ts` source file declaring a string constant. That file is listed in `gasDevConfig.loadOrder`, so tests, `gas-test build`, gas-dev-release and gas-dev-bundle need no changes.
6. A `--check` mode reports a stale generated file, and `gas-dev-config check` runs it.

It belongs in the build, not in gas-dev-release: gas-dev-release only copies `dist/`, while tests, Apps Script tests and type-checking need the generated file earlier.

Proposed home: a `gas-dev-config html` command configured by `gasDevConfig.html` (`[{ entry, out, name }]`).

Local workflow: `npm run dev` watches the browser TypeScript and serves `dev/`, which loads `src/web/ui.html` with the mock server injected. `npm run build` regenerates the constant, then runs `tsc`.

## Dependency on gas-webapp

The webapp and dialog build step, the browser and shared source layout (gas-webapp already has `src/web/`, `src/shared/` and a frontend tsconfig), and the `google.script.run` client wrapper are to be settled in the gas-webapp review first. gas-config then adopts the result: either through gas-dev-config, if the build step moves there, or by importing gas-webapp's client.

Questions the gas-webapp review should answer for gas-config:

- Where the build step lives (gas-dev-config command or gas-webapp tooling), and its configuration shape.
- Whether gas-config uses gas-webapp's client and RPC conventions or keeps its own single `GasConfigRpc` entry point.
- Whether `dist-web` (gas-webapp's browser release target) or the string-constant approach is the pattern for HtmlService UIs.

## Phases

Each phase is a git-flow branch, executed by a subagent, reviewed and committed. Each phase ends with `npm run check` passing.

| #   | Repo · branch                         | Scope                                                                                                                                                                                                                                       | Depends on |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | gas-webapp · review                   | Settle the build step, the web/shared layout and the client conventions                                                                                                                                                                     | none       |
| 1   | gas-dev-config · `feature/html-build` | `html` command and `--check`, `gasDevConfig.html` validation, fixture tests, README, CHANGELOG. Release 1.5.0. May be replaced or reshaped by phase 0                                                                                       | 0          |
| 2   | gas-config · `feature/gas-dev-config` | Shared presets (`gas.json` at ES2020, `web.json`, `test.json`), `gasEslint()` including web code, Prettier key, gas-dev-release, dependabot, scripts, `npm audit fix`. Delete `scripts/`. No source changes                                 | none       |
| 3   | gas-config · `feature/v2-core`        | Remove the 1.x source and gas-sheetdb. New types, shared validation ported from `prototype/validation.js`, Script Properties storage with lock and version stamp, `get()`/`getAll()`. Vitest with service mocks                             | 2          |
| 4   | gas-config · `feature/access-control` | `editors` allowlist, email lookup, refusal on empty email, authorization on every RPC call. Unit tests                                                                                                                                      | 3          |
| 5   | gas-config · `feature/web-ui`         | Port the prototype to `src/web/` in TypeScript: real `google.script.run` client, brand tokens, generated HTML. Move the harness to `dev/`. Playwright tests for the key flows                                                               | 1, 4       |
| 6   | gas-config · `feature/ui-host`        | `showDialog`, `showSidebar`, `createHtmlOutput`, template bootstrapping, `GasConfigRpc`, conflict detection, change logging. Optional peers: gas-lock, gas-logger, gas-error                                                                | 5          |
| 7   | gas-config · `feature/gas-test`       | Apps Script tests: properties round trip, lock, Session email, HTML output construction. Manual checklist for opening the dialog and sidebar, which cannot be automated. Confirm scopes (expected: `script.container.ui`, `userinfo.email`) | 6          |
| 8   | gas-config · `release/2.0.0`          | README rewrite (install, scopes, allowlist, web app deployment, theming), `peer/gas-config.peer.types.d.ts`, CHANGELOG, remove `prototype/`, `test:gas`, `build:release`                                                                    | 7          |

Secrets, if accepted, add a phase after 4 (see below).

## Lessons from the 1.x review

The 1.x code is retired, but these defects must not reappear in 2.0. Each needs a test.

- A required entry may have an empty default. It is invalid until filled, not a schema error.
- Optional entries may be empty for every type, and may omit a default.
- Saving writes only the changed keys and never overwrites another key with a stale cached value. The cache is restored if the write fails.
- Schema defaults are typed by `type`, not as literals: `set('flag', true)` must compile when the default is `false`, and `type` must constrain `default`.
- `NaN` and `Infinity` are not numbers. Locales are validated with `Intl.getCanonicalLocales`, not a two-letter pattern.
- `get()` on an unknown key throws. Returned objects are copies.
- One invalid value never makes the other keys unreadable.
- Errors carry a `[GasConfig]` prefix, and become `GasValidationError` when gas-error is loaded.
- No work at construction time: a global `new GasConfig(...)` must not touch any Apps Script service until first use.

## Secrets

### Could API keys live in gas-config?

Yes, with conditions. Script Properties is where secrets are stored today, so gas-config storing them there is no weaker. The UI adds two benefits: managers can rotate a key without a developer, and every change is logged.

Requirements, if accepted:

- **A `secret` field type that is write-only.** `getSettings()` never returns its value. The UI shows `Set · ends in 1234 · updated <date> by <email>`, with Replace and Clear actions. The value is only read on the server, through a separate `getSecret(key)`, so nobody reaches it by accident through `get()`.
- **A separate, tighter `secretEditors` allowlist.** It is empty by default: until it is set, secret fields are shown as locked.
- **Redaction.** Change logs, error messages and validation messages never include a secret value; logs record only that it was changed, and by whom. Validation may check the format, for example a key prefix, without echoing the value.
- **A separate namespace** (`gasConfig:secret:<key>`), so secrets never mix with plain values in `getAll()`.
- **Optional, later:** a server-side "Test" action that checks the key against its API.

### Limits to be explicit about

- The access boundary is edit access to the script, not the allowlist. Anyone who can open the script editor (for bound scripts, every editor of the container) can read Script Properties or run code that does. The allowlist only governs the UI.
- Script Properties are not encrypted with a key you control. Encrypting with a key stored in the same project adds nothing. For high-value secrets, the real boundary is Google Cloud Secret Manager, reached with `UrlFetchApp` (needs the `cloud-platform` scope and a GCP project). That gives you access control, rotation and audit logging.

### OAuth tokens are a different problem

Access and refresh tokens are written by code at runtime, change on their own, and may be per user. They are not configuration. Use a token store designed for them, such as Google's [`apps-script-oauth2`](https://github.com/googleworkspace/apps-script-oauth2) library, which handles the authorization flow, refresh and storage in user or script properties. gas-config could hold that service's client ID and client secret as `secret` fields, which is where the two meet.

## Open questions

1. **Allowlist management.** Recommended: `editors` defined in code for 2.0. It is simple, versioned in git, and nothing in the UI can change it. Alternative: a list managed in the UI by an `admins` role. Is the code-defined list enough for 2.0?
2. **Generated HTML file.** Recommended: commit it, guarded by `html --check`, as with lockfiles, so a fresh clone, `npm test` and bundling work without a build first. Alternative: ignore it in git and generate it in typecheck and test setup. (May be decided by the gas-webapp review.)
3. **Invalid stored value.** With Properties this only happens after a schema change, such as a lowered `max`. Recommended: `get()` returns the default and logs a warning, and the UI shows the stored value flagged so an editor fixes it.
4. **Date values.** Recommended: `get()` returns `'YYYY-MM-DD'`, avoiding timezone surprises. Alternative: a `Date`.
5. **Remote.** Should GitHub become the canonical remote before phase 2? gas-dev-release assumes it; `origin` is currently Gitea.
6. **Secrets.** Include the write-only `secret` type with `secretEditors` in 2.0, defer it to 2.1, or leave secrets out of gas-config?
7. **Secret Manager.** If secrets are included, is an optional Secret Manager backend wanted for high-value keys, or are Script Properties enough?
