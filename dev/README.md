# Development harness

Local environment for the gas-config settings UI, which lives in `src/web/`. Everything here is for development: it is not shipped and not built into the UI. Only `dist/` is released.

The harness loads the real UI sources (`src/web/gas-config.ui.html` and its scripts), not a copy. A mock server stands in for `google.script.run`, so the UI runs in a browser with no Apps Script deployment.

## Running it

```sh
npm run dev
```

starts `dev/serve.js`, a dependency-free Node server, and prints its address (`http://127.0.0.1:5173/` unless `PORT` is set). It serves the repository root read-only, refuses anything outside it or hidden (such as `.git`), sends no-cache headers, and redirects `/` to `/dev/index.html`.

A browser request for `src/**/*.js` with no such file but a sibling `.ts` is answered with that TypeScript transpiled on the fly (ES2020, no module system), the same way `gas-dev-config html` transpiles it, so edits show on reload.

The UI can also be opened on its own at `/src/web/gas-config.ui.html` with `?surface=`, `?theme=` and `?scenario=` query parameters. `surface` and `theme` are only a fallback for what the page's bootstrap lacks (see below); `scenario` is read by the mock server alone.

## Harness

`index.html` hosts the UI inside an imitation of each Workspace surface. The toolbar is a development tool, not part of the product. The selection is kept in the query string, so a URL is shareable and survives a refresh.

| Control  | Values                                                          |
| -------- | --------------------------------------------------------------- |
| Surface  | `sidebar`, `dialog`, `page`                                     |
| Theme    | `workspace`, `yorsh`                                            |
| Scenario | see below                                                       |
| Reload   | Reloads the frame and resets the mock server's in-memory state. |

The close buttons in the imitation chrome, and `google.script.host.close()`, hide the frame and offer **Reopen**.

| Scenario         | Behaviour                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `normal`         | Everything succeeds after 600 ms.                                                                                  |
| `slow`           | 2.5 s latency, to judge loading and saving states.                                                                 |
| `invalid`        | The server rejects `form.url` even when it passes client rules (server-only checks).                               |
| `conflict`       | The first save returns a conflict; after Reload, saves work.                                                       |
| `readonly`       | `canEdit` is `false`; a save would fail with a 401 `UNAUTHORIZED` envelope.                                        |
| `unauthorized`   | The user may edit, but every save fails with a 401 `UNAUTHORIZED` envelope; the UI switches to read-only.          |
| `load-error`     | The first `getSettings` fails with a 500 envelope; Try again succeeds.                                             |
| `timeout`        | The first save is never answered. The client times out after 30 s, retries with the same `saveId`, and it works.   |
| `timeout-twice`  | The first two saves are never answered: the client shows its retry, then the "may not have been saved" banner.     |
| `stored-invalid` | `getSettings` flags `form.url` as holding an invalid stored value, which the UI shows as an error on first render. |

## Files

| File                      | Role                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `serve.js`                | The development server described above.                                                     |
| `mock-server.js`          | `google.script.run` (`GasConfigRpc`) and `google.script.host` stand-ins with a demo schema. |
| `index.html`, `harness.*` | The harness described above.                                                                |
| `assets/yorsh-mark.svg`   | The owner's brand mark, shown by the Yorsh theme on the page surface.                       |

The UI document references the mock server with `data-dev-only`, so `gas-dev-config html` removes it from the built page. End-to-end tests (`npm run test:e2e`) drive this harness with Playwright.

## Page bootstrap

The built page carries `<script type="application/json" id="gas-config-bootstrap">{}</script>`, whose content the server replaces with a `GasConfigBootstrap`:

```ts
type GasConfigBootstrap = {
  surface?: 'dialog' | 'sidebar' | 'page';
  theme?: 'workspace' | 'yorsh';
  brand?: { primaryColor?: string; logoUrl?: string };
  state?: GasConfigSettingsState;
};
```

With `state`, the UI renders at once and makes no `getSettings` call. `brand.primaryColor` is applied as `--color-primary` on `<html>`. Unreplaced, `{}` makes the UI fetch its own state, which is how the harness runs.

## Client/server contract

The authoritative types are in `src/shared/gas-config.contract.types.ts`. Every call goes through one entry point, `GasConfigRpc(method, payload)`.

```ts
getSettings(): SettingsState

saveSettings({ changes: Record<string, Value>, version: string, saveId: string }):
  | { ok: true, values, version }
  | { ok: false, reason: 'invalid', errors: Record<string, string> }
  | { ok: false, reason: 'conflict', version }
```

`saveSettings` receives only the changed keys. `saveId` is new for each user-initiated save and reused by a retry, so the server can replay a save it already applied. A failed call (not authorised, network) reaches the failure handler as an error whose message is the JSON envelope `{ ok: false, status, code, error, details? }`; the browser client parses it into an error with `status` and `code`.

```ts
type Value = string | number | boolean | null;

type SettingsState = {
  title: string;
  description?: string;
  canEdit: boolean;
  version: string;
  brand?: { logoUrl?: string };
  groups: { id: string; label: string; description?: string }[];
  fields: ClientField[];
  values: Record<string, Value>;
  /** Keys whose stored value is invalid; `values` holds that stored value. */
  invalid?: string[];
};

type ClientField = {
  key: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'select' | 'url' | 'date';
  label: string;
  description?: string;
  group?: string;
  required: boolean;
  default: Value;
  placeholder?: string;
  options?: { value: string; label: string }[];
  rules?: {
    min?: number;
    max?: number;
    integer?: boolean;
    maxLength?: number;
    pattern?: string;
    patternMessage?: string;
  };
};
```

Dates travel as `'YYYY-MM-DD'` strings, because `google.script.run` cannot transfer `Date` objects. Empty optional values are `null`.

## Field types and rules

Empty optional values are always valid.

| Rule                | Message                                    |
| ------------------- | ------------------------------------------ |
| Required and empty  | `This field is required`                   |
| Not a finite number | `Enter a number`                           |
| `integer`           | `Enter a whole number`                     |
| `min`               | `Enter a value of at least {min}`          |
| `max`               | `Enter a value of at most {max}`           |
| `maxLength`         | `Use {maxLength} characters or fewer`      |
| `pattern`           | `patternMessage`, or `Enter a valid value` |
| `url` type          | `Enter a link starting with https://`      |
| `select` type       | `Choose one of the options`                |
| `date` type         | `Enter a valid date`                       |

Errors show after a field is blurred or a save is attempted, then update live while typing.

## Theming

Components reference CSS custom properties only. The two built-in themes are token blocks on `:root[data-theme="workspace"]` and `:root[data-theme="yorsh"]`, and spacing differs per `:root[data-surface=…]`. The UI sets `data-surface` and `data-theme` on `<html>` from the bootstrap. A brand override (`brand.primaryColor`) sets a token inline on `<html>`, for example:

```html
<html data-theme="workspace" style="--color-primary: #7a1f5c"></html>
```

## Known gaps versus production

- Google draws the real title bar and close button for sidebars and dialogs; the harness only imitates them.
- Roboto is loaded from Google Fonts.
- The restore icon path should be checked against the official Material Symbols `restart_alt` asset.
- Light mode only.
- Client validation is UX only; the server re-validates every save.
