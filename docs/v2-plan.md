# gas-config 2.0 plan

Status: draft, revised 2026-10-31 against the released gas-webapp 1.0.0 (see [Findings from gas-webapp 1.0.0](#findings-from-gas-webapp-100)). Ready to start once the [open questions](#open-questions) are answered.

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
| Remote           | GitHub is canonical for every gas-\* repository (`github:yorsh-co/gas-config.git`)                                                       |
| gas-webapp       | Not a dependency. gas-config follows its layout, tooling and conventions but owns its RPC entry point and browser client                 |

## Findings from gas-webapp 1.0.0

What gas-webapp settled, and what gas-config takes from it:

| Topic                 | gas-webapp 1.0.0                                                                                                                                                       | gas-config 2.0                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source layout         | `src/` backend, `src/web/` browser, `src/shared/` contract types, `src/types/` type-only files, `src/internal/` canonical peer `.d.ts`                                 | Same layout                                                                                                                                                                                                                                                                                    |
| TypeScript            | `tsconfig.json` (`gas.json`, excludes `src/web`), `tsconfig.frontend.json` (`web.json`, `src/web` + `src/shared`), `tsconfig.test.json`, `tsconfig.peer.json`          | Same files. The frontend emits to `.build/web/` (gitignored, never shipped), since only the generated string constant ships                                                                                                                                                                    |
| Scripts               | `build:backend`, `build:frontend`, a combined `build:watch`, and `typecheck:*` per config                                                                              | Same, plus the HTML build step in `build:frontend`                                                                                                                                                                                                                                             |
| ESLint                | `gasEslint({ web: { files: ['src/web/**/*.ts'], tsconfig: './tsconfig.frontend.json' } })`; gas-dev-config 1.5 forbids `async` in Apps Script sources (P8)             | Same. The server side of the UI is synchronous; `async` is only allowed in `src/web/`                                                                                                                                                                                                          |
| Browser release       | Compiled `.js` and `.d.ts` on a second `dist-web` branch. Consumers subtree it and wrap each file into a `.js.html` partial themselves (P6)                            | Not suitable: the UI must be self-contained and installable through gas-dev-bundle. gas-config keeps the string constant and ships one `dist` target                                                                                                                                           |
| Wrapping browser code | Ad hoc `wrapScript` in `scripts/build-manual-webapp.js`, which rejects code containing `<?` or `</script`                                                              | Becomes the rule set of the `gas-dev-config html` command, so gas-webapp's manual build can reuse it                                                                                                                                                                                           |
| Browser client        | `window.GasWebApp.api`, routed through `google.script.run.doGet`/`doPost`, with timeouts, retries and delivery acknowledgement through `CacheService`                  | Not reused: it requires the project to route `doGet`/`doPost` through a `GasWebApp`, and a Docs- or Forms-bound project with only a dialog has neither. gas-config's client keeps the conventions (promise wrapper, per-call timeout, parsed error envelope) and calls `GasConfigRpc` directly |
| Silent drops          | `google.script.run` "silently drops calls often enough" to need detection                                                                                              | Saves carry a client-generated `saveId`; the server stores the last one with the version, so a retried save replays its success instead of reporting a false conflict                                                                                                                          |
| Auth                  | `createAuthMiddleware({ isAuthorized })`: `Session` email; empty → 401 `Unable to identify the signed-in user`; refused → 401 `Not authorized`; never echoes the email | Same semantics and messages, as `GasUnauthorizedError` when gas-error is loaded, otherwise an error with the same `status` and `code`                                                                                                                                                          |
| Error envelope        | `{ ok: false, status, code, error, details? }` from `GasError.handle`, thrown over `google.script.run` and parsed into a `ServerError`                                 | Same envelope for failures, so a project using both libraries handles errors one way                                                                                                                                                                                                           |
| Deployment            | Web app with **Execute as: User accessing the web app** and `userinfo.email`; under **Execute as: Me**, consumer and external accounts have a blank email              | Same requirement for the page surface. Dialogs and sidebars run as the active user, but still need `userinfo.email`                                                                                                                                                                            |
| Entry points          | `const doGet = app.doGet` works over HTTP but not over `google.script.run` (P10)                                                                                       | `GasConfigRpc` is a function declaration, and the README says why                                                                                                                                                                                                                              |
| Manual checks         | `manual/` fixture, `npm run manual:build` assembling a clasp-pushable `.manual-webapp/`, script ID from the environment, a checklist                                   | Same pattern: a container-bound fixture (dialog and sidebar in Sheets, Docs and Forms) and a web app deployment                                                                                                                                                                                |
| Docs                  | README "Platform limitations" table (P1–P10) and "Platform notes" from a deployed app; canonical `peer/*.peer.types.d.ts` type-checked by `typecheck:peer`             | Same structure                                                                                                                                                                                                                                                                                 |

### Integration gap: the page surface in a gas-webapp project

A standalone script that already serves a gas-webapp app owns `doGet`. gas-webapp's `res` cannot send a prebuilt `HtmlOutput` (`send` takes text, `render` takes view files), so gas-config's page cannot be a route. Options:

- **A.** The consumer's `doGet` returns `config.createHtmlOutput()` for one path before delegating to the app. It works today but bypasses gas-webapp's middleware, which is acceptable because gas-config authorizes every RPC itself.
- **B.** gas-webapp 1.1 accepts an `HtmlOutput` in `res.send` (or adds `res.html(output)`), so the settings page becomes an ordinary route behind the app's middleware.

## Architecture

```text
src/
  shared/gas-config.validation.ts      one rule set, compiled by both tsconfigs
  shared/gas-config.contract.types.ts  RPC request and response shapes
  types/gas-config.types.ts            schema, field and option types
  internal/                            canonical peer .d.ts: gas-error, gas-logger, gas-lock
  gas-config.storage.ts                Script Properties, lock, version stamp, saveId
  gas-config.access.ts                 allowlist and identity
  gas-config.ui.ts                     dialog, sidebar, page, GasConfigRpc
  gas-config.class.ts
  web/  gas-config.ui.html  gas-config.ui.css  gas-config.ui.ts
  generated/gas-config.ui.html.ts      written by the build step, never edited by hand
dev/     harness and mock server (from prototype/), not shipped
manual/  fixture and checklist for container-bound and web app checks, not shipped
peer/    gas-config.peer.types.d.ts
```

### Storage

- One property per key, `gasConfig:<key>`, JSON-encoded so types round-trip. The version stamp and the last `saveId` are stored alongside the values.
- One `getProperties()` call per execution, then served from memory. A missing key returns its default.
- Writes take the lock through GasLock when it is loaded, otherwise through LockService. Only changed keys are written.
- Limits: 9 KB per value and 500 KB per store, plus daily quotas on property reads and writes. None of them matter for configuration.

### Access

- `editors: string[]` in the constructor options, compared case-insensitively with `Session.getActiveUser().getEmail()`.
- Failures follow gas-webapp's auth middleware: an empty or unreadable email is a 401 `Unable to identify the signed-in user`, and a user who is not listed is a 401 `Not authorized`. Neither message contains the email.
- Every RPC call is authorized on the server, not only opening the UI.
- This is a guard against UI users. Anyone who can edit the script can read and change Script Properties.

### Server UI

- `showDialog()`, `showSidebar()`, and `createHtmlOutput()` for `doGet`.
- One public global, `function GasConfigRpc(method, payload)`, routes the UI's calls. `google.script.run` only reaches top-level function declarations whose names do not end in `_` (gas-webapp P10).
- The page is served with `HtmlService.createHtmlOutput()`, not as a template, so no inlined code is evaluated as a scriptlet. The surface, theme, brand tokens, logo and initial state are injected as JSON, with `<` escaped, into a `<script type="application/json">` placeholder.
- An optional logger (GasLogger or `console`) records each change: who, key, old value, new value.

### Schema

- Types: `string`, `text`, `number`, `boolean`, `select`, `url`, `date`.
- Rules the browser also checks: `required`, `min`, `max`, `integer`, `maxLength`, `pattern` with `patternMessage`, `options`.
- Server-only check: `validate(value) => string | null`, which returns a message rather than a boolean so the UI can show it.
- Values cross `google.script.run` as JSON-safe types: dates as `'YYYY-MM-DD'`, empty values as `null`. `undefined` arrives in the browser as `null`.

### Client/server contract

As implemented by the prototype (`prototype/README.md`), extended for silent drops:

- `getSettings()` returns `{ title, description?, canEdit, version, brand?, groups, fields, values }`.
- `saveSettings({ changes, version, saveId })` sends only the changed keys. It returns one of:
  - `{ ok: true, values, version }`, also when `saveId` repeats the last successful save
  - `{ ok: false, reason: 'invalid', errors }`
  - `{ ok: false, reason: 'conflict', version }`
  - or fails with the error envelope, for example a 401 when the user is not authorized.
- The client applies a per-call timeout. A save that times out tells the user it could not be confirmed and retries with the same `saveId`.

## HTML build step

gas-webapp 1.0.0 shipped without a shared build step, so this is new work. Its manual build's `wrapScript` is the starting rule set.

Requirements:

1. Browser code is edited as `.html`, `.css` and TypeScript files and runs locally against a mock server, as `prototype/` does today.
2. `tsc -p tsconfig.frontend.json` compiles the browser TypeScript into `.build/web/`.
3. The command inlines local `<link rel="stylesheet">` and `<script src>` into the HTML. External URLs such as Google Fonts are left as they are. A script resolves against the compiled output, a stylesheet against the source.
4. It fails on inlined code containing `</script` (or `</style` in CSS), naming the file, as `wrapScript` does. `<?` is allowed, since the output is served without template evaluation.
5. It removes elements marked `data-dev-only`, such as the mock server.
6. It writes a `.ts` source file declaring a string constant. That file is listed in `gasDevConfig.loadOrder`, so tests, `gas-test build`, gas-dev-release and gas-dev-bundle need no changes.
7. A `--check` mode reports a stale generated file, and `gas-dev-config check` runs it.

It belongs in the build, not in gas-dev-release: gas-dev-release only copies `dist/`, while tests, Apps Script tests and type-checking need the generated file earlier.

Home: a `gas-dev-config html` command, configured by `gasDevConfig.html` (`[{ entry, out, name }]`), released as gas-dev-config 1.6.0.

Local workflow: `npm run dev` runs the frontend compiler in watch mode and serves `dev/`, which loads `src/web/gas-config.ui.html` with the mock server injected. `npm run build` runs `build:backend`, then `build:frontend` (compile and regenerate the constant).

## Testing

| Layer         | Tooling                                                                                                                        | Covers                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Unit, server  | Vitest with `createGasLoader` and fakes of `PropertiesService`, `LockService`, `Session` and `HtmlService`, as gas-webapp does | Storage, access, RPC, validation, bootstrap injection                                          |
| Unit, browser | Vitest with `createGasLoader` over a fake `window` and `google.script.run`, as gas-webapp's `client-harness.ts` does           | The RPC client: timeouts, error parsing, `saveId` retries                                      |
| Browser flows | Playwright against `dev/` (see [open question 8](#open-questions))                                                             | Rendering per surface and theme, validation timing, save, conflict, read-only and load failure |
| Apps Script   | `gas-dev-config gas-test`, scopes in `gasDevConfig.gasTest`                                                                    | Properties round trip, lock, `Session` email, `HtmlOutput` construction                        |
| Manual        | `manual/` fixture and `npm run manual:build`, as in gas-webapp                                                                 | Opening the dialog and sidebar in Sheets, Docs and Forms; the web app deployment; scopes       |

## Phases

Each phase is a git-flow branch, executed by a subagent, reviewed and committed. Each phase ends with `npm run check` passing.

| #   | Repo · branch                         | Scope                                                                                                                                                                                                                  | Depends on |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | gas-webapp · review                   | Done: gas-webapp 1.0.0 released (see findings)                                                                                                                                                                         | none       |
| 1   | gas-dev-config · `feature/html-build` | `html` command and `--check` with the rules above, `gasDevConfig.html` validation, fixture tests, README, CHANGELOG. Release 1.6.0                                                                                     | none       |
| 2   | gas-config · `feature/gas-dev-config` | gas-dev-config `^1.5.0` presets and the gas-webapp tsconfig and script layout, `gasEslint()` with `web`, Prettier key, gas-dev-release, dependabot, `npm audit fix`. Delete `scripts/`. No source changes              | none       |
| 3   | gas-config · `feature/v2-core`        | Remove the 1.x source and gas-sheetdb. Types, shared validation ported from `prototype/validation.js`, Script Properties storage with lock, version stamp and `saveId`, `get()`/`getAll()`. Vitest with service fakes  | 2          |
| 4   | gas-config · `feature/access-control` | `editors` allowlist and identity with gas-webapp's auth semantics and messages, authorization on every RPC call. Canonical peer `.d.ts` for gas-error. Unit tests                                                      | 3          |
| 5   | gas-config · `feature/web-ui`         | Port the prototype to `src/web/` in TypeScript: RPC client, brand tokens, generated HTML through phase 1. Move the harness to `dev/`. Browser unit tests, and Playwright if accepted                                   | 1, 4       |
| 6   | gas-config · `feature/ui-host`        | `showDialog`, `showSidebar`, `createHtmlOutput`, JSON bootstrap, `GasConfigRpc`, conflict detection, change logging. Optional peers: gas-lock, gas-logger, gas-error                                                   | 5          |
| 7   | gas-config · `feature/gas-test`       | Apps Script tests, plus the `manual/` fixture and checklist. Confirm scopes (expected: `script.container.ui`, `userinfo.email`)                                                                                        | 6          |
| 8   | gas-config · `release/2.0.0`          | README rewrite (install, scopes, allowlist, deployment, theming, Platform limitations and notes), `peer/gas-config.peer.types.d.ts` with `typecheck:peer`, CHANGELOG, remove `prototype/`, `test:gas`, `build:release` | 7          |

Phases 1 and 2 are independent and can run in parallel. Secrets, if accepted, add a phase after 4. Option B of the [integration gap](#integration-gap-the-page-surface-in-a-gas-webapp-project) adds a gas-webapp 1.1 phase before 6.

## Lessons to carry into 2.0

The 1.x code is retired, but these defects must not reappear in 2.0. Each needs a test.

- A required entry may have an empty default. It is invalid until filled, not a schema error.
- Optional entries may be empty for every type, and may omit a default.
- Saving writes only the changed keys and never overwrites another key with a stale cached value. The cache is restored if the write fails.
- Schema defaults are typed by `type`, not as literals: `set('flag', true)` must compile when the default is `false`, and `type` must constrain `default`.
- `NaN` and `Infinity` are not numbers. Locales are validated with `Intl.getCanonicalLocales`, not a two-letter pattern.
- `get()` on an unknown key throws. Returned objects are copies.
- One invalid value never makes the other keys unreadable.
- Errors carry a `[GasConfig]` prefix, and become gas-error classes when gas-error is loaded.
- No work at construction time: a global `new GasConfig(...)` must not touch any Apps Script service until first use.

From gas-webapp 1.0.0:

- Apps Script sources have no `async` or `await`; only `src/web/` may use them (P8).
- Entry points reachable from `google.script.run` are function declarations, never aliases (P10).
- Optional peers fail only at runtime when absent (P7): every use of a peer is guarded, with a fallback.
- `Date` and `undefined` do not survive `google.script.run`; the contract uses `'YYYY-MM-DD'` and `null`.

## Secrets

### Could API keys live in gas-config?

Yes, with conditions. Script Properties is where secrets are stored today, so gas-config storing them there is no weaker. The UI adds two benefits: managers can rotate a key without a developer, and every change is logged.

Requirements, if accepted:

- **A `secret` field type that is write-only.** `getSettings()` never returns its value. The UI shows `Set · ends in 1234 · updated <date> by <email>`, with Replace and Clear actions. The value is only read on the server, through a separate `getSecret(key)`, so nobody reaches it by accident through `get()`.
- **A separate, tighter `secretEditors` allowlist.** It is empty by default: until it is set, secret fields are shown as locked.
- **Redaction.** Change logs, error messages and validation messages never include a secret value; logs record only that it was changed, and by whom. Validation may check the format, for example a key prefix, without echoing the value. This matches gas-webapp's logging middleware, which masks `token`, `password`, `secret`, `key` and `auth` query values.
- **A separate namespace** (`gasConfig:secret:<key>`), so secrets never mix with plain values in `getAll()`.
- **Optional, later:** a server-side "Test" action that checks the key against its API.

### Limits to be explicit about

- The access boundary is edit access to the script, not the allowlist. Anyone who can open the script editor (for bound scripts, every editor of the container) can read Script Properties or run code that does. The allowlist only governs the UI.
- Script Properties are not encrypted with a key you control. Encrypting with a key stored in the same project adds nothing. For high-value secrets, the real boundary is Google Cloud Secret Manager, reached with `UrlFetchApp` (needs the `cloud-platform` scope and a GCP project). That gives you access control, rotation and audit logging.

### OAuth tokens are a different problem

Access and refresh tokens are written by code at runtime, change on their own, and may be per user. They are not configuration. Use a token store designed for them, such as Google's [`apps-script-oauth2`](https://github.com/googleworkspace/apps-script-oauth2) library, which handles the authorization flow, refresh and storage in user or script properties. gas-config could hold that service's client ID and client secret as `secret` fields, which is where the two meet.

## Open questions

1. **Allowlist management.** Recommended: `editors` defined in code for 2.0. It is simple, versioned in git, and nothing in the UI can change it. Alternative: a list managed in the UI by an `admins` role. Is the code-defined list enough for 2.0?
2. **Allowlist shape.** gas-webapp takes a policy function, `isAuthorized(email)`. Recommended: `editors: string[]` for gas-config, which is what a configuration screen needs and is harder to get wrong. Alternative: accept `isAuthorized` as well, for parity. Is the list alone enough?
3. **Users who are not editors.** Recommended: they see the read-only view the prototype already has, with `Only listed editors can change these settings.` Alternative: `getSettings()` refuses them with a 401, which matters if secrets are added. Read-only or refused?
4. **Generated HTML file.** Recommended: commit it, guarded by `html --check`, as with lockfiles, so a fresh clone, `npm test` and bundling work without a build first. Alternative: ignore it in git, as gas-webapp ignores `.manual-webapp/`, and generate it before typecheck and tests.
5. **Invalid stored value.** With Properties this only happens after a schema change, such as a lowered `max`. Recommended: `get()` returns the default and logs a warning, and the UI shows the stored value flagged so an editor fixes it.
6. **Date values.** Recommended: `get()` returns `'YYYY-MM-DD'`, avoiding timezone surprises. Alternative: a `Date`.
7. **Page surface in a gas-webapp project.** Option A (the consumer's `doGet` short-circuits to `createHtmlOutput()`) or option B (gas-webapp 1.1 sends an `HtmlOutput` from a route)? Recommended: A for 2.0, B as a follow-up if a project needs the settings page behind its middleware.
8. **Playwright.** No gas-\* repository uses it yet. Recommended: add it as a dev dependency for the browser flows; the prototype review caught a lost Save click that only a real browser reproduces. Alternative: Vitest with a DOM library, which is faster but misses layout and focus behaviour.
9. **Secrets.** Include the write-only `secret` type with `secretEditors` in 2.0, defer it to 2.1, or leave secrets out of gas-config?
10. **Secret Manager.** If secrets are included, is an optional Secret Manager backend wanted for high-value keys, or are Script Properties enough?
