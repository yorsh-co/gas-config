# Settings UI prototype

Visual and UX direction for the gas-config 2.0 settings UI, served by Apps Script `HtmlService` as a sidebar, a modal dialog or a standalone web page. This prototype is not shipped: only `dist/` is released.

It is plain HTML, CSS and JavaScript with no build step, no framework and no dependencies. Scripts are classic global-style files (no ES modules), mirroring what a build step will later inline into a single `HtmlService` document.

## Opening it

Open `index.html` directly in a browser, or serve the folder:

```sh
npx http-server prototype
python3 -m http.server -d prototype
```

`ui.html` can also be opened on its own with `?surface=`, `?theme=` and `?scenario=` query parameters.

## Harness

`index.html` hosts `ui.html` inside an imitation of each Workspace surface. The toolbar is a development tool, not part of the product. The selection is kept in the query string, so a URL is shareable and survives a refresh.

| Control  | Values                                                          |
| -------- | --------------------------------------------------------------- |
| Surface  | `sidebar`, `dialog`, `page`                                     |
| Theme    | `workspace`, `yorsh`                                            |
| Scenario | see below                                                       |
| Reload   | Reloads the frame and resets the mock server's in-memory state. |

The close buttons in the imitation chrome, and `google.script.host.close()`, hide the frame and offer **Reopen**.

| Scenario     | Behaviour                                                                            |
| ------------ | ------------------------------------------------------------------------------------ |
| `normal`     | Everything succeeds after 600 ms.                                                    |
| `slow`       | 2.5 s latency, to judge loading and saving states.                                   |
| `invalid`    | The server rejects `form.url` even when it passes client rules (server-only checks). |
| `conflict`   | The first save returns a conflict; after Reload, saves work.                         |
| `readonly`   | `canEdit` is `false`; saving fails with a not-the-owner error.                       |
| `load-error` | The first `getSettings()` fails; Try again succeeds.                                 |

## Files

Load order in `ui.html`: `ui.css`, then `validation.js`, `mock-server.js`, `ui.js`.

| File                      | Role                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `ui.html`                 | The settings document; app root only.                                      |
| `ui.css`                  | All styling, driven by theme and surface tokens.                           |
| `validation.js`           | `GasConfigValidation`: pure functions shared by client and, later, server. |
| `mock-server.js`          | `google.script.run` and `google.script.host` stand-ins with a demo schema. |
| `ui.js`                   | Schema-driven renderer and state machine; exports no global.               |
| `assets/yorsh-mark.svg`   | The owner's brand mark, shown by the Yorsh theme on the page surface.      |
| `index.html`, `harness.*` | Development harness described above.                                       |

## Client/server contract

```ts
getSettings(): SettingsState

saveSettings({ changes: Record<string, Value>, version: string }):
  | { ok: true, values, version }
  | { ok: false, reason: 'invalid', errors: Record<string, string> }
  | { ok: false, reason: 'conflict', version }
```

`saveSettings` receives only the changed keys. A failed call (not authorised, network) reaches the failure handler instead.

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

Components reference CSS custom properties only. The two built-in themes are token blocks on `:root[data-theme="workspace"]` and `:root[data-theme="yorsh"]`, and spacing differs per `:root[data-surface=…]`. The server sets `data-surface` and `data-theme` on `<html>` in production. A brand override sets tokens on `:root`, for example:

```html
<html data-theme="workspace" style="--color-primary: #7a1f5c"></html>
```

## Known gaps versus production

- Google draws the real title bar and close button for sidebars and dialogs; the harness only imitates them.
- Roboto is loaded from Google Fonts.
- The restore icon path should be checked against the official Material Symbols `restart_alt` asset.
- Light mode only.
- Client validation is UX only; the server re-validates every save.
