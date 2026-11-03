# Manual checks

Some behaviour only exists inside a real Google Workspace host: the authorization prompt, how a modal dialog and a sidebar are sized, what `Session` returns for each kind of user, and how `HtmlService` serves the page. `clasp run` has no UI context, so `npm run test:gas` cannot exercise any of it. This folder holds a small consumer project that exposes all of it, and the checklist to run against it.

The fixture is `app.js`, `appsscript.json` and one host file, `manual/hosts/<host>.js`. `npm run manual:build` assembles it with the bundled peers (gas-error, gas-lock, gas-logger) and the compiled library into `.manual-config/`, which `clasp` pushes. `appsscript.json` declares no `oauthScopes` on purpose: Apps Script detects the scopes from the code, and check 1 verifies that list against the [Scopes](../README.md#scopes) the README documents (`userinfo.email`, `script.container.ui` and the host's `…currentonly` scope).

> **Warning:**
> The web app deploys with **Execute as: User accessing the web app** and **access: Anyone with a Google account**. Use a throwaway project and a throwaway container, and **archive the deployment** (Deploy, Manage deployments) when the checks are done.

## Setup (Sheets)

1. Create a spreadsheet, then Extensions, Apps Script. Copy the script ID (Project Settings).
2. Log in to clasp and enable the Apps Script API, once: `npx clasp login`.
3. Edit `FALLBACK_EDITORS` in `app.js` to your email, or set the `MANUAL_EDITORS` script property (below).
4. Build and push. The script ID stays in your environment and is never written to the repository:

   ```bash
   export MANUAL_CONFIG_SCRIPT_ID=<script id>
   export MANUAL_CONFIG_HOST=sheets
   npm run manual:build
   cd .manual-config
   npx clasp push --force
   ```

   `MANUAL_CONFIG_HOST` names the container the project is bound to, and must be one of these values:

   | Value    | Container    | Host file                |
   | -------- | ------------ | ------------------------ |
   | `sheets` | Spreadsheet  | `manual/hosts/sheets.js` |
   | `docs`   | Document     | `manual/hosts/docs.js`   |
   | `slides` | Presentation | `manual/hosts/slides.js` |
   | `forms`  | Form         | `manual/hosts/forms.js`  |

   Any other value makes the build exit with an error.

5. Reload the spreadsheet. A **Settings** menu appears. The first use asks for authorization (check 1).
6. For the page, first set the `MANUAL_APP_NAME` script property (a web app has no active container, so there is no name to fall back on). Then, in the Apps Script editor: Deploy, New deployment, Web app. Execute as: **User accessing the web app**. Who has access: **Anyone with Google account**. Copy the `/exec` URL. After a later push, create a new version of the deployment to serve it.

### Switches

Set these under Project Settings, Script properties. The fixture reads them on every execution, so there is no need to push again.

| Property              | Effect                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `MANUAL_EDITORS`      | Comma-separated editor emails; overrides `FALLBACK_EDITORS`                                                             |
| `MANUAL_THEME`        | `workspace`, or `yorsh` (default)                                                                                       |
| `MANUAL_LOGO`         | `true` shows a `data:` image logo (the Yorsh theme only)                                                                |
| `MANUAL_BRAND_COLOR`  | A hex colour such as `#276182`, overriding the primary colour                                                           |
| `MANUAL_APP_NAME`     | The app name shown on the page; falls back to the container's name only where a container is active, not in the web app |
| `MANUAL_LARGE_SCHEMA` | `true` adds 150 fields in 5 more groups                                                                                 |

Values the UI saves are Script Properties named `gasConfig:<key>`; `gasConfig:__version` and `gasConfig:__saveId` are the version stamp and last save id.

### Docs, Slides and Forms

The fixture is the same for every container except one file. Create the document, presentation or form, open its Apps Script editor (Docs and Slides: Extensions, Apps Script; Forms: the three-dot menu, Script editor), and repeat steps 1 to 6 with that project's script ID and `MANUAL_CONFIG_HOST` set to `docs`, `slides` or `forms`. `manual/hosts/<host>.js` holds the only host-specific code: `getUi_()`, which calls that host's service and carries `@OnlyCurrentDoc`. The build pushes one host file, so the project names one service and asks for that host's current-document scope only. That is consumer code. It is the reason the library takes the `Ui` as an argument and never names those services: a single reference would ask every consumer for the scopes of all four.

## Checklist

Run with a signed-in editor unless the row says otherwise.

| #   | Check                                    | How                                                                                                                                                           | Expected                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Authorization lists only expected scopes | Fresh project, first menu use: read the consent screen. Also read Project Settings after the first run (with "Show appsscript.json" ticked, none are written) | Only: `script.container.ui` (the consent screen words it "display and run third-party web content in prompts and sidebars"), `userinfo.email`, the host's `…currentonly` scope (for example `spreadsheets.currentonly`) and, if listed, `script.storage`. No all-files Sheets, Docs, Slides or Forms access, and no other host's scope |
| 2   | Menu                                     | Reload the host document                                                                                                                                      | A **Settings** menu with **Open dialog** and **Open sidebar**                                                                                                                                                                                                                                                                          |
| 3   | Dialog size and title                    | Settings, Open dialog                                                                                                                                         | A modal dialog about 600 by 560, titled **Fixture settings** (the instance title). Content fits without a horizontal scrollbar                                                                                                                                                                                                         |
| 4   | Sidebar title and width                  | Settings, Open sidebar                                                                                                                                        | Sidebar titled **Fixture settings**, 300 px wide; fields and the footer fit without horizontal scrolling                                                                                                                                                                                                                               |
| 5   | First render, no skeleton                | Open the dialog, sidebar and page; watch the first paint                                                                                                      | The form appears at once. No skeleton placeholders flash (the embedded state is used, so `getSettings` is not called)                                                                                                                                                                                                                  |
| 6   | Page viewport on mobile                  | Open the `/exec` URL on a phone                                                                                                                               | The page uses the device width (viewport meta tag present), is readable without pinch-zoom, and does not scroll sideways. The app name shows above the title and in the tab                                                                                                                                                            |
| 7   | Edit and save                            | As an editor, change **Pass mark**, press Save                                                                                                                | The Save button disables, a snackbar confirms, the footer clears. Reopening shows the new value; `gasConfig:scoring.passMark` is set in Script properties                                                                                                                                                                              |
| 8   | Change log entry                         | After check 7, open Executions (or Logs) for the `GasConfigRpc` run                                                                                           | One `[GasConfig] Settings changed` entry with the user, key, `from` and `to`. It is written after the save completed (no lock wait or timeout in the run)                                                                                                                                                                              |
| 9   | Conflict across two tabs                 | Open the page in two tabs. Save a change in tab 1, then a different change in tab 2                                                                           | Tab 2 reports the settings changed elsewhere and offers to reload; nothing from tab 2 is written                                                                                                                                                                                                                                       |
| 10  | Non-editor read-only view                | Sign in as a second account not in `MANUAL_EDITORS`, open the page (and the dialog if the account can open the document)                                      | The values show, every control is disabled, and the banner reads **Only listed editors can change these settings.** No Save button                                                                                                                                                                                                     |
| 11  | Unidentified user, Execute as: Me        | Change `appsscript.json` `webapp.executeAs` to `USER_DEPLOYING`, push, make a new version, open the URL as an external or consumer account                    | `Session` returns a blank email: the page opens read-only (an editor cannot edit). Revert afterwards                                                                                                                                                                                                                                   |
| 12  | Unauthorized save                        | In the editor's tab, remove your email from `MANUAL_EDITORS`, then press Save                                                                                 | The UI switches to read-only with the not-authorized message. No property changes. Restore the property afterwards                                                                                                                                                                                                                     |
| 13  | Invalid stored value flagged             | Set the Script property `gasConfig:scoring.passMark` to `"abc"` by hand, then open the dialog                                                                 | **Pass mark** shows `abc` flagged as an error from the first render; the other fields are fine. `get('scoring.passMark')` still returns the default 70                                                                                                                                                                                 |
| 14  | Yorsh theme, logo and brand colour       | `MANUAL_THEME` `yorsh`, `MANUAL_LOGO` `true`, `MANUAL_BRAND_COLOR` `#276182`, then open the page, dialog and sidebar                                          | Yorsh styling, the Yorsh icon (a blue circle with a white mark) on the page, dialog and sidebar, and the primary colour on buttons and focus rings. With `MANUAL_THEME` `workspace` the logo is not shown                                                                                                                              |
| 15  | Each container type                      | Repeat checks 1 to 8 in Sheets, Docs, Slides and Forms                                                                                                        | Identical behaviour; each host's `getUi_()` works, with its own `…currentonly` scope                                                                                                                                                                                                                                                   |
| 16  | Large schema within limits               | `MANUAL_LARGE_SCHEMA` `true`, open the dialog, scroll, edit a field in the last group, save                                                                   | The dialog opens (the embedded state stays within HtmlService limits), scrolls smoothly, and the save works                                                                                                                                                                                                                            |

## After the checks

1. Copy anything that holds for every user into the README's [Platform limitations](../README.md#platform-limitations), and anything observed on a deployed project into its [Platform notes](../README.md#platform-notes).
2. Archive the deployment (Deploy, Manage deployments), or delete the project and container.
3. `rm -rf .manual-config`, and unset `MANUAL_CONFIG_SCRIPT_ID` and `MANUAL_CONFIG_HOST`.
