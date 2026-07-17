# gas-config

[![Built with Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)

## In-sheet configuration management for Google Apps Script projects.

> The goal of this project is to provide a runtime configuration tool for Apps Script projects that is viewable and editable in Google Sheets for both technical and non-technical users.

`gas-config` uses [gas-sheetdb](https://github.com/yorsh-co/gas-sheetdb) to provide a config layer for Apps Script projects with in-sheet editing.

Configuration values are displayed and edited in a sheet (`.config` by default, configurable per instance) that provides user-friendly labels, descriptions and data validation for runtime configuration values that can be used throughout the Apps Script project by calling `config.get(...)`.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

### Features

- Define system config variables in-code
- Validates the config during load, persistence, and schema synchronization
- Preserves config value types
- Populates new config values with defaults
- Stores config data persistently in Google Sheets
- Loads changes from .config sheet on first access and caches values in-memory
- Caches config data in-memory for speed
- Lock-safe writes to the spreadsheet thanks to `gas-sheetdb`
- Custom entry validation support
- IDE autocomplete typedef support
- No external dependencies beyond `gas-sheetdb` and built-in Apps Script services

### Example usage

```js
const locale = config.get('system.locale');

new Date().toLocaleString(locale);
```

## Requirements

### Dependencies

`gas-config` depends on [`gas-sheetdb`](https://github.com/yorsh-co/gas-sheetdb), which provides the `SheetDb` library used internally for spreadsheet-backed storage.

You must [install](#quick-start) both repositories in your Apps Script project.

### Scopes

`gas-config` requires no additional auth scopes other than [those required by `gas-sheetdb`](https://github.com/yorsh-co/gas-sheetdb#requirements).

## Quick Start

It is recommended to use `gas-sheetdb` together with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows. See [Setup instructions with `clasp`](#setup-instructions-with-clasp) for more information.

#### 1. Add `gas-sheetdb` to your Apps Script project and review the library's configurations

`gas-sheetdb` is intended to be added directly into Apps Script projects using git subtree.

See the [`gas-sheetdb`'s README](https://github.com/yorsh-co/gas-sheetdb#quick-start) for more details.

```bash
git subtree add \
  --prefix=src/lib/gas-sheetdb \
  https://github.com/yorsh-co/gas-sheetdb.git \
  0.1.2 \
  --squash
```

This creates:

```txt
src/lib/gas-sheetdb/
```

#### 2. Add this library to your Apps Script project

This repository is intended to be added directly into Apps Script projects using git subtree.

```bash
git subtree add \
  --prefix=src/lib/gas-config \
  https://github.com/yorsh-co/gas-config.git \
  1.0.1 \
  --squash
```

This creates:

```txt
src/lib/gas-config/
```

#### 3. Define the [configuration schema](#define-configuration-schema-entries) entries

## Setup instructions with `clasp`

`gas-config` works best with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows.

#### 1. Install clasp

```bash
npm install -g @google/clasp
```

#### 2. Enable the [Apps Script API](https://script.google.com/home/usersettings)

#### 3. Login to Google Apps Script

```bash
clasp login
```

#### 4. Clone or create your Apps Script project

Clone an existing project:

```bash
clasp clone <script-id>
```

or create a new project:

```bash
clasp create --type sheets
```

#### 5. Import `gas-sheetdb`

```bash
git subtree add \
  --prefix=src/lib/gas-sheetdb \
  https://github.com/yorsh-co/gas-sheetdb.git \
  0.1.2 \
  --squash
```

This creates:

```txt
src/lib/gas-sheetdb/
```

#### 6. Review `gas-sheetdb` configurations

See the [`gas-sheetdb`'s README](https://github.com/yorsh-co/gas-sheetdb#quick-start) for more details.

#### 7. Import `gas-config`

```bash
git subtree add \
  --prefix=src/lib/gas-config \
  https://github.com/yorsh-co/gas-config.git \
  1.0.1 \
  --squash
```

This creates:

```txt
src/lib/gas-config/
```

#### 8. Configure the file push order

Apps Script executes files by the order in the Apps Script editor, from top to bottom. By default, `clasp push` orders the files alphabetically, by file name. If a file referencing `GasConfig` (including your own project's config instantiation file) is ordered before `gas-config`'s own files, `clasp push` will succeed but running the project will throw:

```txt
ReferenceError: GasConfig is not defined
```

To avoid this, add a [`filePushOrder`](https://github.com/google/clasp#filepushorder-optional) entry to your project's `.clasp.json` that pushes `gas-sheetdb` and `gas-config`'s module files ahead of any file that references them:

```json
{
  "filePushOrder": [
    "src/lib/gas-config/module/gas-config.validator.js",
    "src/lib/gas-config/module/gas-config.storage.js",
    "src/lib/gas-config/module/gas-config.class.js",
    "src/lib/gas-config/module/gas-config.presets.js",
    "src/lib/gas-config/module/gas-config.types.js"
  ]
}
```

Alternatively, you can manually move these files to the top of the file list in the Apps Script editor.

> **Note:**
> Any file in your own project that constructs a `GasConfig` instance (e.g. `config = new GasConfig({ ... })`) must be pushed _after_ the entries above.

#### 8. Push local files to Apps Script

```bash
clasp push
```

#### 9. Define the [configuration schema](#define-configuration-schema-entries) entries

## Basic Usage

### Create a GasConfig Instance

Construct your own `GasConfig` instance with a schema and (optionally) a sheet name, following the [supported structure](#configuration-schema).

```js
const config = new GasConfig({
  schema: {
    'system.locale': GasConfig.presets.locale,
    'gForms.formUrl': {
      type: 'string',
      required: true,
      label: 'Google Form URL',
      default: '',
      description: 'The edit URL for your Google Form',
      example: 'https://docs.google.com/forms/d/abc.../edit',
      validate: (value) => {
        if (typeof value !== 'string') return false;

        const GOOGLE_FORM_EDIT_URL_REGEX =
          /^https:\/\/docs\.google\.com\/forms\/d\/([\w-]+)\/edit(?:[/?#]\S*)?$/;

        return GOOGLE_FORM_EDIT_URL_REGEX.test(value);
      },
    },
  },
});
```

`GasConfig.presets` (see [Define Configuration Schema Entries](#define-configuration-schema-entries)) provides ready-made entries for common settings, which you can spread or reference directly into your own schema.

> **Recommended pattern:**
> Declare your instance once as a global constant and reference it everywhere else in the project, rather than constructing a new `GasConfig` per file.

### Define Configuration Schema Entries

Build your schema object from `GasConfig.presets` entries, your own custom entries, or a mix of both, following the [supported structure](#configuration-schema):

```js
const schema = {
  ...GasConfig.presets,

  'feature.myCustomFlag': {
    type: 'boolean',
    required: true,
    label: 'My Custom Flag',
    default: false,
    description: 'Example of a custom, project-specific entry.',
    example: true,
  },
};

const config = new GasConfig({ schema });
```

### Synchronize Schema to the Google Sheet

Run this during project initialization.

```js
config.syncSchema();
```

This will:

- create the config sheet if not yet created
- populate the sheet with new schema entries
- update metadata for existing entries in the sheet
- populate default values
- push metadata fields to the sheet

### Read Configuration Values

```js
const locale = config.get('system.locale');
```

### Update Configuration Values

```js
config.set('feature.enableSync', false);
```

All values are validated before persistence.

### Force Reload Cached Values

```js
config.load({ force: true });
```

## Project Details

### Configuration Schema

Each schema entry supports:

```js
/**
 * @typedef {Object} GasConfigSchemaEntry
 * @property {GasConfigValueType} type
 * @property {boolean} required
 * @property {string} label
 * @property {GasConfigValue} default
 * @property {string} [description]
 * @property {GasConfigValue} [example]
 * @property {(value:GasConfigValue) => boolean} [validate]
 */
```

#### Supported Value Types

Currently supported (defined in `module/gas-config.presets.js`):

```js
const SUPPORTED_CONFIG_VALUE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object', // Prefer date objects only
]);
```

> **Note:**
> `object` accepts any JavaScript object type. Date objects are recommended but not enforced.
> Although complex value types like json and array are supported by `gas-sheetdb` through encoding, their use is discouraged in a schema to allow direct editing of the .config sheet without the risk of malformed configuration data.

### Validation

The validator layer performs:

- unknown key detection
- required value checks
- type validation
- custom validator execution
- schema validation
- default value validation

> **Note**
>
> - Invalid values throw runtime errors immediately
> - Unknown keys are logged but do not throw errors
> - Custom validator functions must return a boolean

Example:

```js
config.set('system.locale', 'invalid');
```

Throws:

```txt
Error: Invalid config value: system.locale
```

### Storage Layer

Configuration entries are stored inside the config sheet (`.config` by default) using [`gas-sheetdb`](#dependencies).

The storage layer automatically handles:

- inserts
- updates
- schema synchronization
- metadata persistence

### Runtime Cache

Each `GasConfig` instance maintains its own in-memory cache using `Map`.

This avoids repeated spreadsheet reads during execution.

```js
const locale = config.get('system.locale');
```

Values are loaded lazily (from the spreadsheet) on first access. On subsequent accesses during the same script execution, values are loaded from the in-memory cache stored on the instance.

### Entry Point

#### GasConfig

Constructor:

- `new GasConfig({ schema, sheetName = '.config' })`

Methods:

- `load(options)`
- `get(key)`
- `set(key, value)`
- `save()`
- `syncSchema()`

#### `GasConfig.presets`

Static property on `GasConfig` providing ready-made schema entries (currently `locale` and `enableSync`) for common configuration values.

#### \_GasConfigStorage

Constructor:

- `new _GasConfigStorage(sheetName)`

Methods:

- `load()`
- `save(data)`
- `syncSchema(schema)`

#### \_GasConfigValidator

Methods:

- `validateEntry(key, value, schema)`
- `validateEntries(data, schema)`
- `validateSchema(schema)`

### Example Initialization Script

```js
const config = new GasConfig({
  schema: { ...GasConfig.presets },
});

function init() {
  config.syncSchema();

  Logger.log('Configuration synchronized');
}
```

## Planned features

- Remove stale rows
- Delete schema entries
- Define Google Sheets data validation in `CONFIG_SCHEMA` and apply it automatically to the sheet on schema sync

## License

MIT

See the repository root `LICENSE` file for details.

## Support

Issues and feature requests are welcome via GitHub Issues.

Maintained by [yorsh-co](https://github.com/yorsh-co?utm_source=chatgpt.com).
