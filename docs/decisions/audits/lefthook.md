# Privacy audit: lefthook v2.2.2 (npm) / repo commit b57a872

**Verdict: Local only.** lefthook runs the commands in your own config on your machine. It has no telemetry and sends nothing anywhere unless you run `lefthook self-update` or name a `remotes:` config.

2026-11-22 · profile personal · static · source https://github.com/evilmartians/lefthook (commit b57a872374b9), npm `lefthook@2.2.2`

## What it does with your data

It reads `lefthook.yml`, git state and staged file names, and runs the configured commands. It writes git hooks under `.git/hooks`, and, with the beta `ai:` block, generated agent settings (`.claude/settings.json`, `.github/hooks/lefthook.json`, and others). Nothing is uploaded.

## Where it connects

| Host | Kind | What is sent | When | Disclosed? | Evidence |
|---|---|---|---|---|---|
| api.github.com, release assets | own service | version check, asset download | only on `lefthook self-update` | yes, docs | `internal/updater/updater.go:30`, `cmd/self_update.go:59` |
| any git remote named in `remotes:` | user-chosen | git clone/fetch | only if configured | yes, docs | `docs/configuration/remotes.md` |

The scanner's other hosts are documentation links, test fixtures and packaging scripts. `internal/` contains no other `net/http` use and no analytics or error-reporting code.

## Findings

### 1. npm postinstall runs a local command (note)

`postinstall.js` runs the platform binary with `install` in the project folder (skipped when `CI` is set). It does not download anything; the binary comes from the `optionalDependencies` platform packages.

## Coverage

- Read: updater, `cmd/self_update.go`, `postinstall.js`, `get-exe.js`, `package.json`, docs for `ai`, `remotes`, `glob`; all 58 scanner leads triaged (tests, CI, docs, packaging).
- Not read: the prebuilt per-platform binary packages (`lefthook-darwin-arm64` and similar); Go source was read instead. Go dependencies by manifest only.
- Dynamic check: none.
- Would change the verdict: a sandbox run of the published binary showing traffic beyond the above.
