# Privacy audit: postcss-html 2.0.0

**Verdict: Local only.** A PostCSS syntax that lets stylelint read `<style>` blocks in HTML-like files (here, `.astro`). In the code read, it parses text it is given and returns a syntax tree. It makes no network requests and has no telemetry.

2026-11-23 · profile personal · static review of the published npm tarball (fetched with `privacy.py fetch npm`, integrity-checked, not installed in the audit folder) · jq-privacy-audit run (`scan`, then a read of every lead)

## What it does with your data

stylelint passes it the contents of each `.astro` file. It extracts the style blocks, parses them, and returns them. It reads and writes no files itself.

## Where it connects

None. The scan found no findings, and its hosts are only README links.

## Findings

No findings. Its imports are `htmlparser2`, `js-tokens`, `postcss`, `postcss-safe-parser`, `node:module` and `node:path`, plus its own modules. There are no install scripts (its `scripts` are test, lint and version tasks).

## Coverage

- Read: `package.json` and every import in `lib/` (19 files).
- Dependencies: covered by the dependency-tree check in the stylelint audit (no network code, no install scripts).
- Pinned exactly (`2.0.0`).
- Not done: a sandbox run.
