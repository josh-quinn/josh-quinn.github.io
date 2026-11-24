# Privacy audit: ajv 8.20.0

**Verdict: Local only.** Ajv is an offline JSON Schema validator. It reads the schema and data you hand it, validates them in memory and returns the result. It makes no network calls, writes no files and has no telemetry.

2026-11-24 · profile personal · static, read-only (package fetched from the registry, integrity-checked, never installed or run) · source https://www.npmjs.com/package/ajv 8.20.0

## What it does with your data

It compiles a schema into a JavaScript function and runs your data through it. Nothing is stored or sent. It is used here as a dev dependency to validate the CV content file in unit tests.

## Where it connects

None. The only URLs in shipped code are `json-schema.org` and `raw.githubusercontent.com` identifiers inside the bundled meta-schemas. These are schema IDs, not requests. Remote `$ref` loading happens only if the caller supplies a `loadSchema` function (`dist/core.js:163`); this repo does not.

## Findings

### 1. Code generation with `new Function` (note)

Ajv builds validators with `new Function(...)` from the schema (`dist/compile/index.js:89`). The code comes from the schema you give it, so schemas must be trusted. Ours is committed in this repo.

### 2. Install scripts (none)

`package.json` has no `preinstall`, `install`, `postinstall` or `prepare` script.

## Coverage

- Read: scanner output for all 466 shipped files, grep for `http`, `net`, `child_process`, `fs`, `os`, `dns`, `process.env`, `fetch`, `XMLHttpRequest` in `dist/` (no hits).
- Dependencies (`fast-deep-equal`, `fast-uri`, `json-schema-traverse`, `require-from-string`): installed copies grepped for network, process and environment use and for install scripts: no hits.
- Would change the verdict: nothing foreseen.
