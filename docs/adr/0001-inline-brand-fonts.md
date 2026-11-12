# 0001. Inline the brand typefaces

## Context

The `yorsh` theme uses Space Grotesk (headings) and DM Sans (body) from
`@yorsh/brand`. The brand requires that no font comes from a third party.
Apps Script HtmlService cannot serve static files, so a font cannot be linked
by URL from the deployed page.

## Decision

The WOFF2 files are vendored in `src/web/fonts/` with their SIL OFL 1.1
licence texts. `scripts/build-fonts.js` encodes them as base64 `data:` URLs in
the generated `src/web/gas-config.fonts.css`, which `gasdev html` inlines into
the page. `npm run build:frontend` runs the script with `--check`, so a stale
file fails the build. The `workspace` theme keeps loading Roboto from Google
Fonts, unchanged.

## Consequences

- Every consumer's generated HTML grows by about 79 KB of base64, including
  users of the `workspace` theme. Browsers decode only the faces a page uses,
  so workspace pages render no differently.
- No request for the brand fonts leaves the page.
- To update the fonts, copy the WOFF2 and OFL files from `@yorsh/brand` into
  `src/web/fonts/`, then run `npm run build:fonts`.
