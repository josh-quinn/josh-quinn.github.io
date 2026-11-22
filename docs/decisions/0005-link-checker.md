# 0005. Link checker: lychee

Status: accepted (2026-11-22). Read by Task 5.

## Context

CI and the pre-push gate should catch broken internal links in the built site and, in CI only, broken external links. No third-party API key, no AI.

## Options

| | lychee 0.24.2 | linkinator | markdown-link-check | htmltest |
|---|---|---|---|---|
| Stars / licence | 4.2k, Apache-2.0 | 1.3k, MIT | 0.7k, ISC | 0.4k, MIT |
| Activity | Commits Nov 2026 | Nov 2026 | Oct 2026 | Last push Jan 2025 |
| Runtime | Rust binary | Node | Node | Go binary |
| Works on built HTML | Yes, plus Markdown | Yes (crawls a served site) | Markdown only | Yes |
| Offline internal check | `--offline` | Needs a server | n/a | Yes |
| GitHub Action | `lycheeverse/lychee-action` v2.9.0 | None official | Community | None |

## Decision

lychee. In CI use `lycheeverse/lychee-action` pinned by commit SHA, with `lycheeVersion` pinned (the action default is v0.24.2). Run `--offline` on `dist/` for internal links in the gate; run external-link checks only in CI (a scheduled job, not blocking merges, since external sites flake). Locally it is optional (release binary, with the published sha256 checked).

Hands-on: downloaded the macOS arm64 release, verified its sha256, and ran `lychee --offline --no-progress --root-dir <dir> <file>` on a test page with a broken and a good link: 2 total, 1 OK, 1 error ("File not found"), non-zero exit. Run on the current `dist/` it found 0 links (the page has none yet).

Note: the action downloads the release tarball with `curl` and does not verify a checksum; the pinned version and SHA pin limit the exposure.

## Evidence

- https://github.com/lycheeverse/lychee , https://github.com/lycheeverse/lychee-action
- Stats from the GitHub API on 2026-11-22; alternatives: https://github.com/JustinBeckwith/linkinator , https://github.com/tcort/markdown-link-check , https://github.com/wjdp/htmltest

## Privacy-audit verdict

Local only. No telemetry. It sends requests only to the URLs found in the checked content (with a `GITHUB_TOKEN` to GitHub for GitHub links, if provided, and an optional cookie jar). Report: [audits/lychee.md](audits/lychee.md).
