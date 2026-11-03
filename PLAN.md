# Plan: gas-config 2.0 manual-check follow-through

Branch: bugfix/gas-logger-2 · Base: develop (stacked: develop → feature/manual-check-fixes → bugfix/yorsh-fixture-logo → bugfix/gas-logger-2)

## Goal

Close release PLAN.md step 3 and HANDOFF.md so gas-config 2.0.0 can be released. The peers are gas-logger `^2.0.1` and gas-error `^1.2.2` (gas-lock stays `^1.2.0`; it has no peers), with vendored declarations copied from those tags, and bundling them prints no peer-range warning. The manual build refuses to assemble a fixture whose bundled peers name a host service. The empty Results template is removed from `manual/README.md`, and the README gains a "Platform notes" section. `npm run check` and `npm run test:e2e` pass.

## Items

- bugfix: gas-config's peers still allow gas-error releases whose gas-logger range is `^1.1.0`, so bundling them with gas-logger 2.x warns, and the 1.x sheet sink added the Sheets scope to Docs, Slides and Forms projects (check #1). Phases 1–2
- docs: record the manual-check outcome. Phase 3

## Constraints & decisions

- Continue on the existing `bugfix/gas-logger-2` (tip `116710a`), which already sets gas-logger to `^2.0.0` and re-copies its declarations. Do not start a new git-flow branch. Setup: `git checkout bugfix/gas-logger-2` in this worktree, then write and commit PLAN.md there.
- This worktree has no `node_modules`. Run `npm ci` before Phase 1. That step, and `bundle()` in `manual:build`, need network access to GitHub. Approving this plan approves that access.
- gas-lock declares no peers and never uses gas-logger, so its range (`^1.2.0`) and vendored declarations stay as they are.
- Canonical peer declarations come from the sibling repos' release tags: `git -C /home/jsp/Git/portfolio/gas/<lib> show <tag>:peer/<lib>.peer.types.d.ts`. Copy them verbatim, without hand edits.
- Root cause of #1 on Docs, Slides and Forms: the gas-logger 1.x sheet sink names `SpreadsheetApp` (`openByUrl`, `openById`, `getActiveSpreadsheet`), and Apps Script adds a scope for every service named in the project, peers included. gas-logger 2.x takes the spreadsheet from the caller. The owner re-ran #1 on all four hosts with gas-logger 2.x and it passed, so the README Scopes table needs no new row.
- The peer scan lives in the manual build, not in `npm test`, so that `npm run check` never needs the network. The scan function is a small module that the unit tests exercise offline. `test/scopes.test.ts` keeps its own `FORBIDDEN` list; do not refactor it.
- Apps Script's scope detection reads comments too (see `test/scopes.test.ts` "catches a reference, comments included"), so the peer scan is a plain word-boundary match over the bundled text.
- Owner decision: all manual checks passed, and the raw results were not kept. Remove the Results section rather than fill it in.
- Out of scope: finishing the stacked branches, the release branch, pushes, and `build:release`. The Report lists those commands for the owner.

## Phases

### Phase 1: Peer ranges and declarations — [x] done

- Files: `package.json`, `README.md`, `CHANGELOG.md`, `src/internal/gas-logger.peer.types.d.ts`, `src/internal/gas-error.peer.types.d.ts`
- Steps:
  1. Confirm the tags exist: `git -C /home/jsp/Git/portfolio/gas/gas-error tag -l v1.2.2` and `git -C /home/jsp/Git/portfolio/gas/gas-logger tag -l v2.0.1`. If either is missing, report `blocked`.
  2. Run `npm ci` if `node_modules` is missing.
  3. In `package.json` `gasDevConfig.peers`, set `gas-error` to `^1.2.2` and `gas-logger` to `^2.0.1`. Make the same change in the README gas-dev-bundle example (`README.md` around line 134).
  4. Overwrite `src/internal/gas-logger.peer.types.d.ts` and `src/internal/gas-error.peer.types.d.ts` with the canonical copies from gas-logger `v2.0.1` and gas-error `v1.2.2`. gas-error is expected to be unchanged already. Run `npx prettier --write` on them only if `format:check` flags them.
  5. In `CHANGELOG.md` `[Unreleased]`:
     - fix the "Breaking" bullet that still reads `gas-error (^1.2.0) and gas-logger (^1.3.0)` so it gives the new ranges (gas-lock stays `^1.2.0`);
     - reword the existing "Changed" line added in `116710a` to: the peers are gas-logger `^2.0.1` and gas-error `^1.2.2`; gas-logger 2.x's sheet sink takes the spreadsheet from the caller, so bundling it no longer adds the Sheets scope to Docs, Slides and Forms projects; and gas-error 1.2.2 accepts gas-logger 2.x without a peer warning.
  6. `grep -rn '\^1\.3\.0\|"gas-error": "\^1\.2\.0"' README.md docs manual package.json` must find nothing outside the CHANGELOG's history. `docs/v2-plan.md` is historical; leave it.
- Done when: `npm run typecheck && npx vitest run && MANUAL_CONFIG_SCRIPT_ID=dummy MANUAL_CONFIG_HOST=docs npm run manual:build 2>&1 | tee "$TMPDIR/manual-build.log" | tail -5 && ! grep -q 'gas-dev-bundle: warning' "$TMPDIR/manual-build.log"`. Afterwards, `rm -rf .manual-config`.
- Review: standard

### Phase 2: Manual build refuses peers that name a host service — [x] done

- Files: `scripts/host-services.js` (new), `scripts/build-manual-config.js`, `test/manual-fixture.test.ts`
- Steps:
  1. Add tests to `test/manual-fixture.test.ts` for `namedHostServices(code)`, imported from `../scripts/host-services.js`:
     - `'SpreadsheetApp.openById(x)'` gives `['SpreadsheetApp']`;
     - `'// DocumentApp.getUi()'` gives `['DocumentApp']` (comments count);
     - `'const MySpreadsheetAppLike = 1; spreadsheetApp;'` gives `[]` (word boundary, case-sensitive);
     - code naming all four gives the four in `HOST_SERVICES` order.

     The test fails now because the module does not exist.

  2. Create `scripts/host-services.js` (ESM, matching the build script's style, with JSDoc). Export `HOST_SERVICES = ['SpreadsheetApp', 'DocumentApp', 'SlidesApp', 'FormApp']`, with a one-line comment on why (Apps Script adds a scope per service named anywhere in the project), and `namedHostServices(code)`, which returns the services that `\b<name>\b` matches.
  3. In `scripts/build-manual-config.js`, bundle the peers into a variable before `emit('lib/gas-libraries.js', …)`. If `namedHostServices(code)` is non-empty, print `Bundled peers name <list>, which adds those services' scopes to every fixture. See manual/README.md check 1.` and `process.exit(1)` before emitting. Update the header comment with one sentence about the check.
  4. Make sure ESLint and the typecheck cover the new file the same way as `scripts/build-manual-config.js`, and do not widen any config.
- Done when: `npx vitest run test/manual-fixture.test.ts && npm run lint && MANUAL_CONFIG_SCRIPT_ID=dummy MANUAL_CONFIG_HOST=docs npm run manual:build 2>&1 | tail -3`. The build must exit 0, which shows that the bundled gas-logger 2.0.1, gas-error 1.2.2 and gas-lock 1.2.x name no host service. Then `rm -rf .manual-config`.
- Review: deep. It gates which OAuth scopes the shipped peers may bring in.

### Phase 3: Manual-check outcome in the docs — [ ] todo

- Files: `manual/README.md`, `README.md`
- Steps:
  1. In `manual/README.md`:
     - delete the whole `## Results` section, from line 87 to the end of the observations table;
     - in the line-60 paragraph, drop the sentence "Add the container and the browser to the Results below.";
     - change "After the checks" step 1 to: "Copy anything that holds for every user into the README's [Platform limitations](../README.md#platform-limitations), and anything observed on a deployed project into its [Platform notes](../README.md#platform-notes)."
     - check that nothing else links to `#results`.
  2. In `README.md`, add `### Platform notes` directly after the Platform limitations table (before `## Development`), in gas-webapp's style: "Observed on deployed projects (`manual/` fixture):", then one bold-led bullet per finding:
     - **Consent wording.** The consent screen describes `script.container.ui` as "display and run third-party web content in prompts and sidebars".
     - **Peers add scopes.** Apps Script scans every file pushed, peers included. With gas-logger 1.x bundled, a Docs, Slides or Forms project was also asked for `spreadsheets.currentonly`, because its sheet sink names `SpreadsheetApp`. gas-logger 2.x takes the spreadsheet from the caller, and the project asks for its own host's scope only.
     - **No active container in a web app.** In `doGet`, the active-container getters (`SpreadsheetApp.getActive()` and the others) return `null`, even in a container-bound project. A name read from the container is therefore unavailable on the page surface, so pass `appName` explicitly.
     - **Same behaviour on every host.** Checks 1 to 8 behaved identically in Sheets, Docs, Slides and Forms, each with its own `…currentonly` scope.
  3. `npx prettier --write README.md manual/README.md`.
- Done when: `npm run format:check && ! grep -n 'Results' manual/README.md && grep -n '### Platform notes' README.md`
- Review: standard

## Log

- Phase 1: gas-error declarations already matched v1.2.2; only gas-logger changed. Build log written to scratchpad (TMPDIR unset).
- Phase 2: added `scripts/host-services.d.ts` (hand-written; test tsconfig has no `allowJs`). The build's exit-1 path is not unit-tested; only `namedHostServices` is.

## Open questions

## Report extras (for the owner, after /phased)

1. Finish in order: `git flow feature finish manual-check-fixes`, `git flow bugfix finish yorsh-fixture-logo`, `git flow bugfix finish gas-logger-2`. Then run `npm run check && npm run test:e2e` on `develop`.
2. Tick release PLAN.md step 3 and delete the untracked `HANDOFF.md` and this worktree (HANDOFF "Housekeeping").
3. Continue release PLAN.md steps 4–5 (`release/2.0.0`, version bump, changelog date, remove `docs/v2-plan.md` but keep "Secrets" as `docs/secrets.md`, then publish after your go-ahead).
