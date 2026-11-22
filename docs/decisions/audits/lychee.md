# Privacy audit: lychee v0.24.2 and lychee-action v2.9.0

**Verdict: Local only.** lychee fetches the links found in the files you point it at. It has no telemetry or error reporting. The GitHub Action downloads the lychee release binary during the run.

2026-11-22 · profile personal · static, plus running the official macOS binary on a test page · source https://github.com/lycheeverse/lychee (commit f10ac27), https://github.com/lycheeverse/lychee-action (commit 649b0e4)

## What it does with your data

It reads the files you name, extracts URLs and requests them. It sends no file content. Requests carry a User-Agent and, for GitHub links, a `GITHUB_TOKEN` if you provide one.

## Where it connects

| Host | Kind | What is sent | When | Disclosed? | Evidence |
|---|---|---|---|---|---|
| every link in the checked content | user-chosen | HTTP request, User-Agent | each run (not with `--offline`) | yes, README | `lychee-bin/src/client.rs:49` |
| api.github.com | own service | token, if set | GitHub links only | yes | `lychee-bin/src/config/mod.rs:646` |
| github.com releases | own service | none (download) | action setup | yes | `lychee-action/action.yml` |

## Findings

### 1. The action does not verify the downloaded binary (note)

`action.yml` fetches `lychee-<arch>-unknown-linux-gnu.tar.gz` with `curl` and extracts it with no checksum check. Pin `lycheeVersion` and the action's commit SHA.

### 2. Cookie jar option (note)

`--cookie-jar` reads and writes cookies; off by default.

## Coverage

- Read: `lychee-bin` and `lychee-lib` leads (network, token, cookie), `action.yml`. Scanner reported 2001 hosts, almost all from test fixtures (`fixtures/bench`).
- Dependencies: `reqwest` and friends by manifest; grep found no telemetry or analytics crates.
- Dynamic check: ran `--offline` against a two-link page: no network use needed, one broken link reported.
- Would change the verdict: nothing foreseen.
