# 0007. CSS linting: stylelint with declaration-strict-value

Status: accepted (2026-11-23). Adopted in Task 6.

## Context

The constitution (IV) and `DESIGN.md` require that colour, font and spacing come only from the token custom properties in `src/styles/tokens.css`, and that decorative gradients never appear. A rule nobody checks drifts, so this needs a linter that:

- fails a build on a raw colour, font family, font size or spacing value outside the token files;
- reads `<style>` blocks inside `.astro` files as well as `.css`;
- needs no network, no API key and no account.

## Options

1. **stylelint with `stylelint-declaration-strict-value`.** stylelint is the standard CSS linter: MIT, OpenJS Foundation, widely used. The plugin (MIT) enforces "this property only takes `var(...)`" per property, with `expandShorthand` so `border: 1px solid #333` is caught. `postcss-html` (MIT) is the PostCSS syntax that lets stylelint read `.astro` style blocks.
2. **stylelint with only built-in rules** (`color-no-hex`, `color-named`, `function-disallowed-list`, `declaration-property-value-allowed-list`). These catch hex and named colours, but not `font-family: Arial`, `padding: 13px` or `rgb(...)` without a long, brittle per-property allow list.
3. **A custom script** (regex over CSS). Less robust than a real parser: shorthands, comments and `.astro` extraction would have to be handled by hand. It is "build before adopting", against the constitution's tooling rule.

## Decision

Option 1.

- **Versions, exact-pinned:** `stylelint@17.16.0`, `stylelint-declaration-strict-value@1.12.1` and `postcss-html@2.0.0`, all at least two weeks old when adopted.
- **Why stylelint 17, not 18:** stylelint 18.0.0 was released on 2026-11-03. The plugin's newest release, 1.12.1, declares `peerDependencies: stylelint >=16 <=17`, and npm refused the install with 18 (ERESOLVE, **run**). The plugin's 1.13.0, released on 2026-11-11, widens the range to 18, but it was under two weeks old. Revisit when 1.13.x has aged: move to stylelint 18 and plugin 1.13 together.
- **Rules** (`.stylelintrc.json`):
  - `scale-unlimited/declaration-strict-value` covers `/color$/`, `fill`, `stroke`, `font-family`, `font-size`, `/^margin/`, `/^padding/`, `gap`, `row-gap`, `column-gap` and `box-shadow`. It expands shorthands, checks functions, and allows `0`, `auto`, `inherit`, `none`, `transparent`, `currentcolor` and `calc()` with `var()`.
  - `color-no-hex` and `color-named: never`.
  - `function-disallowed-list` bans the gradient functions everywhere except the structural paper layer (`src/styles/paper.css`; see `DESIGN.md`, "Paper").
  - The token files (`tokens.css`, `fonts.css`) are exempt from the value rules: they are where raw values live.
- **Wiring:** `npm run lint:css`, the CI job `stylelint`, the gate check `stylelint`, and unit tests in `tests/unit/design/stylelint.test.ts` that lint fixtures with the repo config.

## Consequences

- A component cannot add a colour, font or spacing value that is not a token. A new value means a new token in `tokens.css` and `DESIGN.md`, which is the intent.
- About 200 transitive packages are added to the site's dev dependencies (none with install scripts; see the audits).
- Inline `style=""` attributes are not linted. The site does not use them for design values.

## Evidence

- npm registry metadata for the three packages (`npm view <pkg> time`, `peerDependencies`), and the ERESOLVE report from `npm install stylelint@18.0.0 stylelint-declaration-strict-value@1.12.1` (**run**).
- https://stylelint.io, https://github.com/AndyOGo/stylelint-declaration-strict-value, https://github.com/ota-meshi/postcss-html (not fetched; package READMEs read from the tarballs).

## Privacy-audit verdict

**Local only** for all three. They read the files they are given and write results to the terminal. In the code read there is no telemetry, no network code and no install script. Reports: [audits/stylelint.md](audits/stylelint.md), [audits/stylelint-declaration-strict-value.md](audits/stylelint-declaration-strict-value.md) and [audits/postcss-html.md](audits/postcss-html.md).
