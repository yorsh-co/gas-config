# Plan: fixes and features from the 2.0 manual checks

Branch: feature/manual-check-fixes · Base: develop

## Goal

Act on the findings from `manual/README.md` checks #1, #6, #10 and #14 (release PLAN.md step 3). When this is done, the fixture asks only for `userinfo.email`, `script.container.ui` and its own host's current-document scope. The page footer has side spacing on narrow screens. A read-only boolean label no longer shows a pointer cursor. A new `appName` option names the project on the page. The yorsh logo shows on every surface. `npm run check` and `npm run test:e2e` pass.

## Items

- bugfix: the manual fixture names all four host services, so consent asks for Sheets, Docs, Slides and Forms access (#1). Phase 1
- bugfix: the page footer has no inline padding, so its content touches the screen edges on a phone (#6b). Phase 2
- bugfix: a disabled boolean's label still shows `cursor: pointer` (#10). Phase 3
- feature: an `appName` option, shown above the page title and in the browser tab (#6a). Phases 4–5
- feature: the yorsh logo also shows in the dialog and sidebar (#14). Phase 6

## Constraints & decisions

- Everything goes on one `feature/` branch, as `/phased` works, with one commit per phase. This differs from release PLAN.md step 3 ("each defect on its own `bugfix/*` branch"). If separate branches are wanted, split the branch before finishing.
- Work starts from `develop` (9b8d05a). This worktree's current HEAD (fe173d5, the 1.2.1 hotfix) is stale.
- #1 is not a library defect. `src/` never names a host service, and `test/scopes.test.ts` already enforces that. The fault is in `manual/app.js` `getUi_()`. The fixture now picks one host at build time and carries `/** @OnlyCurrentDoc */`, as a careful consumer would.
- The README's Scopes section gains one sentence: the consumer's own `getUi()` call names the host service, which adds that host's scope; `@OnlyCurrentDoc` narrows it to `…currentonly`.
- `appName` shows on the page surface only. The dialog and sidebar sit inside the document, which names the project already. The tab title becomes `<title> · <appName>`.
- Logo on every surface stays limited to the yorsh theme. Workspace still shows no logo anywhere.
- Phase 1 is `Review: deep` because it decides which OAuth scopes the fixture requests and what the README documents about scopes.

## Phases

### Phase 1: Single-host fixture — [x] done

- Files: `manual/app.js`, `manual/hosts/sheets.js`, `manual/hosts/docs.js`, `manual/hosts/slides.js`, `manual/hosts/forms.js`, `scripts/build-manual-config.js`, `test/manual-fixture.test.ts`, `manual/README.md`, `README.md`
- Root cause: `manual/app.js` `getUi_()` calls `SpreadsheetApp.getUi()`, `DocumentApp.getUi()`, `SlidesApp.getUi()` and `FormApp.getUi()`. Apps Script finds scopes by scanning for service names, so every fixture project asks for all four hosts' data scopes.
- Steps:
  1. Write `test/manual-fixture.test.ts`, reusing the compiled-output scan idea and the `FORBIDDEN` list from `test/scopes.test.ts` (copy the list; do not export it from a test file). Assert two things:
     - `manual/app.js` names none of the four services.
     - `manual/hosts/<host>.js` exists for each of `sheets`, `docs`, `slides` and `forms`, names exactly its own service, and contains `@OnlyCurrentDoc`.
     The test fails now.
  2. Create the four host files. Each is a global-scope file with a header comment, `/** @OnlyCurrentDoc */`, and `function getUi_() { return <Service>.getUi(); }` with JSDoc. Match `app.js` style.
  3. Remove `getUi_()` and its comment from `app.js`. Update the header comment to say the host file supplies it.
  4. In `scripts/build-manual-config.js`, read `MANUAL_CONFIG_HOST` (one of the four; anything else exits with a message, like the existing `MANUAL_CONFIG_SCRIPT_ID` check). Copy `manual/hosts/<host>.js` to `.manual-config/host.js`, and add `host.js` to the push order before `app.js`.
  5. Update `manual/README.md`:
     - setup step 4 sets `MANUAL_CONFIG_HOST`;
     - the "Docs, Slides and Forms" paragraph describes the host files;
     - check 1's expected scopes become `script.container.ui`, `userinfo.email`, the host's `…currentonly` scope and, if listed, `script.storage`. Note that the consent screen words `script.container.ui` as "display and run third-party web content in prompts and sidebars".
  6. Add the one Scopes sentence to `README.md` (see Constraints).
- Done when: `npx vitest run test/manual-fixture.test.ts test/scopes.test.ts` passes; `npm run lint` passes
- Review: deep

### Phase 2: Page footer inline padding — [ ] todo

- Files: `src/web/gas-config.ui.css`, `e2e/render.spec.ts`
- Root cause: `src/web/gas-config.ui.css:715-719`, where `:root[data-surface='page'] .footer-inner` sets `padding-inline: 0`. Below 720px the footer's content sits on the viewport edge. `.main` keeps 16px for the card.
- Steps:
  1. Add an e2e test that opens the page surface at 375×700 with `openReady` and then `page.setViewportSize`. Assert that the status text's left edge and the Save button's right edge are each at least 16px from the viewport edge. The test fails now.
  2. Change the rule to `max-width: 752px; padding-inline: 16px;`. With `box-sizing: border-box`, the content stays aligned with the 720px card at wide widths.
- Done when: `npm run test:e2e -- e2e/render.spec.ts` passes
- Review: standard

### Phase 3: No pointer on a disabled switch label — [ ] todo

- Files: `src/web/gas-config.ui.css`, `e2e/render.spec.ts`
- Root cause: `.switch-row .label { cursor: pointer; }` (around `gas-config.ui.css:432`) has no disabled override. `.switch:disabled` resets only the switch itself.
- Steps:
  1. Add an e2e test with `scenario: 'readonly'`. It asserts that the computed `cursor` of the **Email results to respondents** label is `default`. The test fails now.
  2. Add `.switch-row .switch:disabled + .label { cursor: default; }` after the label rule. The DOM order is control, label, restore (`src/web/gas-config.ui.ts:555`).
- Done when: `npm run test:e2e -- e2e/render.spec.ts` passes
- Review: standard

### Phase 4: `appName` option, server side — [ ] todo

- Files: `src/types/gas-config.types.ts`, `src/gas-config.class.ts`, `src/shared/gas-config.contract.types.ts`, `src/gas-config.ui.ts`, `test/ui-host.test.ts`, `test/gas-config.types-check.ts`
- Steps:
  1. Write the tests first, in `test/ui-host.test.ts`:
     - an invalid `appName` (empty, whitespace, non-string) throws `[GasConfig] Invalid "appName"`;
     - `buildState` includes `appName` when set and omits it when not;
     - `createHtmlOutput()` sets the title `<title> · <appName>` when set, and plain `<title>` otherwise; an explicit `options.title` composes the same way;
     - `showSidebar` and `showDialog` titles are unchanged.
  2. Add `appName?: string` to `GasConfigOptions`, with JSDoc stating that it is shown on the page surface only. Add `appName?: string` to `GasConfigSettingsState`.
  3. In the class, add `appName?: string`, set with `this._resolveText('appName', …)` when given, next to `description`.
  4. In `_GasConfigUi.buildState`, spread `appName` like `description`. In `createHtmlOutput`, compose the tab title.
  5. Add an `appName` line to the types check.
- Done when: `npx vitest run test/ui-host.test.ts` passes; `npm run typecheck` passes
- Review: standard

### Phase 5: `appName` on the page, fixture and docs — [ ] todo

- Files: `src/web/gas-config.ui.ts`, `src/web/gas-config.ui.css`, `dev/mock-server.js`, `e2e/render.spec.ts`, `manual/app.js`, `manual/hosts/*.js`, `manual/README.md`, `README.md`
- Steps:
  1. Add an e2e test: on the page surface, a `p.app-name` with the mock's app name appears before the `h1`. It is absent in the dialog and sidebar. The test fails now.
  2. Give the mock state in `dev/mock-server.js` an `appName` (for example `'Quiz marker'`).
  3. In `renderReady`, on the page surface, render `el('p', { class: 'app-name', text: settings.appName })` first inside `.page-heading`, when it is set. Use `text`, never HTML.
  4. CSS for `.app-name`: secondary text colour, 12–13px, medium weight, `margin: 0 0 2px`, in the style of nearby rules.
  5. In each host file, add `getContainerName_()`:
     - Sheets: `SpreadsheetApp.getActive().getName()`
     - Docs: `DocumentApp.getActiveDocument().getName()`
     - Slides: `SlidesApp.getActivePresentation().getName()`
     - Forms: `FormApp.getActiveForm().getTitle()`
  6. In `app.js`, set `appName` from the `MANUAL_APP_NAME` property, else `getContainerName_()`. Wrap the host call in try/catch and fall back to omitting `appName`, since there may be no active container in some executions. Extend the Phase 1 test so that each host file names only its own service, which still holds.
  7. Docs:
     - `README.md`: add an options-table row for `appName`;
     - `manual/README.md`: add a `MANUAL_APP_NAME` row to the switches table, and update check 6's expected result to "the app name above the title and in the tab".
- Done when: `npm run test:e2e -- e2e/render.spec.ts` passes; `npx vitest run` passes
- Review: standard

### Phase 6: Logo on every surface (yorsh) — [ ] todo

- Files: `src/web/gas-config.ui.ts`, `src/web/gas-config.ui.css`, `e2e/render.spec.ts`, `README.md`, `manual/README.md`
- Steps:
  1. Replace the e2e test `shows the owner logo on the page surface in the yorsh theme only` with a test over `SURFACES`: yorsh shows exactly one `img.logo`, and workspace shows none. The test fails now for the dialog and sidebar.
  2. In `renderReady`, compute `logoUrl` and `showLogo` once, before the surface branch. For the dialog and sidebar, when `showLogo` is true, render `header.surface-header` with the logo at 32×32, followed by the intro paragraph if there is one. Otherwise keep the current intro-only output.
  3. CSS for `.surface-header`: flex, `align-items: center`, 12px gap, `margin-bottom: var(--section-gap)`. Its `.intro` has no bottom margin. Size `.surface-header .logo` at 32px. Keep the sidebar free of horizontal overflow, which the existing render test checks.
  4. Docs:
     - `README.md:535` says "Shown in the `yorsh` theme only";
     - check 14's expected result in `manual/README.md` becomes "the logo (a plum square with an M) on the page, dialog and sidebar".
- Done when: `npm run test:e2e` passes
- Review: standard

## Log

- Phase 1: added a `manual/app.js` eslint global override for `getUi_` (outside the listed files). `@OnlyCurrentDoc` is a standalone comment, which the test enforces. The `MANUAL_CONFIG_HOST` check has no test, and `manual:build` was not run end to end.

## Open questions

- Should each item go on its own `bugfix/*` or `feature/*` branch, as the release PLAN.md step 3 asks? This plan uses one feature branch.
- After merging, re-run checks #1, #6, #10, #14 and #15 on a deployed fixture to confirm.
