# Plan: manual build peer guard test

Branch: bugfix/manual-peer-guard · Base: develop

## Context

HANDOFF.md §1: `scripts/build-manual-config.js:69-77` refuses bundled peers that name a host service (inline `if (named.length > 0) { console.error(…); process.exit(1) }`), but only `namedHostServices()` is tested. The script runs `bundle()` (network) at module level, so it can't be imported into a test. Extract the refusal into `assertNoHostServices(code)` in `scripts/host-services.js` and test it offline. This is a test-only change: the behaviour stays the same and CHANGELOG.md doesn't change. HANDOFF §2–3 (release, publish) stay manual because they finish branches and push, which `/phased` doesn't do.

## Items

- bugfix: cover the manual build's refusal of host-service peers — Phase 1

## Constraints & decisions

- Keep the exit code 1 and the exact message. The build script catches the error, prints `error.message` with `console.error`, and calls `process.exit(1)`.
- The commit type is `test(manual)`, per HANDOFF: `test(manual): cover the build's refusal of peers that name a host service`.
- No CHANGELOG entry, because the behaviour is unchanged. Section 4's changelog step is skipped.

## Phases

### Phase 1: Extract and test `assertNoHostServices` — [ ] todo

- Files: `test/manual-fixture.test.ts`, `scripts/host-services.js`, `scripts/host-services.d.ts`, `scripts/build-manual-config.js`
- Root cause: the refusal is written inline in a script that has network side effects at module level (`scripts/build-manual-config.js:69-77`), so no test can reach it.
- Steps:
  1. In `test/manual-fixture.test.ts`, import `assertNoHostServices` alongside `namedHostServices` and add `describe('assertNoHostServices', …)` after the `namedHostServices` block, with these tests:
     - `assertNoHostServices('SpreadsheetApp.openById(x)')` throws exactly `Bundled peers name SpreadsheetApp, which adds those services' scopes to every fixture. See manual/README.md check 1.`;
     - `'FormApp SlidesApp DocumentApp SpreadsheetApp'` throws a message that starts `Bundled peers name SpreadsheetApp, DocumentApp, SlidesApp, FormApp,` (`HOST_SERVICES` order);
     - `'const x = 1;'` does not throw.
     Run `npx vitest run test/manual-fixture.test.ts` and confirm it fails because the export is missing.
  2. In `scripts/host-services.js`, add `export function assertNoHostServices(code)` with JSDoc (`@param {string} code`, `@throws {Error}` when any service is named). It calls `namedHostServices(code)` and throws `new Error(...)` with the message above, joining the names with `', '`.
  3. In `scripts/host-services.d.ts`, add `export function assertNoHostServices(code: string): void;`.
  4. In `scripts/build-manual-config.js`, change the import to `assertNoHostServices`, then replace lines 70–77 with:
     ```js
     try {
       assertNoHostServices(peerCode);
     } catch (error) {
       console.error(error.message);
       process.exit(1);
     }
     ```
     `namedHostServices` is then unused in the script, so remove it from the import.
- Done when: `npx vitest run test/manual-fixture.test.ts && npm run lint && npm run typecheck` passes; `MANUAL_CONFIG_SCRIPT_ID=dummy MANUAL_CONFIG_HOST=docs npm run manual:build` still builds (needs network access to the peer tags), then `rm -rf .manual-config`.
- Review: standard

## Log

## Open questions

- HANDOFF.md says `develop` was fast-forwarded to `15e792e`. It is actually at `cc05b12`, with no-ff merge commits. This doesn't affect the work.
- `npm run lint` may fail in the main checkout while this worktree exists (HANDOFF Housekeeping). Run the phase from the worktree, or remove the worktree first.
