# Privacy audit: stylelint-declaration-strict-value 1.12.1

**Verdict: Local only.** A stylelint rule plugin. It checks declarations in the CSS that stylelint gives it and reports warnings back to stylelint. In the code read, it makes no network requests and has no telemetry.

2026-11-23 · profile personal · static review of the published npm tarball (fetched with `privacy.py fetch npm`, integrity-checked, not installed in the audit folder) · jq-privacy-audit run (`scan`, then a read of every lead)

## What it does with your data

It receives parsed CSS from stylelint and returns warnings. It reads no files of its own and writes nothing.

## Where it connects

None. The scan's hosts are documentation links in the README and source maps (`stylelint.io`, `drafts.csswg.org`, `www.w3.org`, badge hosts and similar).

## Findings

### 1. Bundled, minified build (note)

The shipped `dist/index.*` files are single-line microbundle builds, so the scan flags them as "minified". Each build has a source map beside it (`dist/*.map`). The modules the builds import are only `assert`, `node:module`, `path`, `url`, `regexp.escape` and `stylelint`, with no `http`, `https`, `net`, `child_process` or `fetch`. The minification is a size build, not obfuscation.

### 2. No install scripts (note)

The manifest's `_postinstall` (`husky install`) is disabled by its leading underscore. `prepublishOnly` and `postpublish` run only for the maintainer. Its one runtime dependency is `regexp.escape` (plus its es-abstract helpers), and none of them has an install script.

## Coverage

- Read: `package.json`; the module imports of `dist/index.cjs` and `dist/index.modern.mjs`; the scan leads.
- Dependencies: covered by the dependency-tree check in the stylelint audit (no network code, no install scripts).
- Pinned exactly (`1.12.1`).
- Not done: a line-by-line read of the minified bundle (it was read through its imports and source map), and a sandbox run.
