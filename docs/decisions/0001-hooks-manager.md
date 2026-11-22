# 0001. Git hooks manager: lefthook

Status: accepted (2026-11-22). Read by Task 5.

## Context

The toolkit needs a git hooks manager for pre-commit and pre-push checks in a Node repo (Astro site, npm, Node 24). It must run a hook only for chosen paths, so a docs-only change does not run the browser tests.

## Options

| | lefthook 2.2.2 | pre-commit 4.7.0 |
|---|---|---|
| Maturity | 9k stars, MIT, since 2019, releases every few weeks | 15.7k stars, MIT, very mature |
| Runtime | Single Go binary, shipped through npm (`lefthook` plus per-platform packages) | Python tool, needs Python and a separate virtualenv per hook repo |
| Node repo fit | Installs as a devDependency; postinstall runs `lefthook install` and skips itself when `CI` is set | Not an npm package; adds a Python dependency to a Node project |
| Path scoping | `glob` (list allowed), `exclude`, `root`, `{staged_files}` / `{push_files}` templates, per job | `files:` and `exclude:` regexes, `types:` per hook |
| Agent hooks | Beta `ai:` block generates `.claude/settings.json` and `.github/hooks/lefthook.json` entries that call `lefthook run <hook>`; no `agy` provider | None |
| Config | `lefthook.yml` plus untracked `lefthook-local.yml` | `.pre-commit-config.yaml` |

## Decision

Adopt lefthook, pinned to an exact version as an npm devDependency (the plan's default, and the better Node fit). Task 5 defines jobs with `glob` scoping. The `ai:` block is beta, so Task 5 may use it to generate the Claude and Copilot edit-time hooks (see 0004) but must not depend on it as the only route. Note: `glob` only filters when the job's `run` uses a file template or a `files` command.

## Evidence

- lefthook repo, `docs/configuration/glob.md`, `root.md`, `ai.md`: https://github.com/evilmartians/lefthook
- npm package postinstall (`postinstall.js`, `get-exe.js`) read from the published tarball: https://www.npmjs.com/package/lefthook
- pre-commit: https://pre-commit.com and https://github.com/pre-commit/pre-commit
- Not run here: lefthook was not installed on the author's machine when this ADR was written.
- Task 5 (**run**): `npm install -D --save-exact lefthook@2.2.2`, whose postinstall wrote `.git/hooks/pre-push`. `lefthook validate` passed on `lefthook.yml`. `lefthook run pre-push` on a non-task branch printed the gate's one-line notice and passed. The `ai:` block is not used: the agent hooks are plain committed config files (see 0004), because lefthook has no agy provider.

## Privacy-audit verdict

Local only. No telemetry or analytics code. Network use is limited to the explicit `lefthook self-update` command (GitHub releases API) and `remotes:` configs the repo itself names. The npm postinstall only runs `lefthook install` locally. Not read: the prebuilt per-platform binary packages (audited from source, not from the shipped binaries). Report: [audits/lefthook.md](audits/lefthook.md).
