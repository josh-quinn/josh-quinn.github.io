# Privacy audit: spec-kit-tdd v2.0.1 (commit 55221d4)

**Verdict: Local only.** The extension is markdown prompts and templates for the user's own coding agent. It contains no code that makes network calls and no telemetry. What the agent does with your code is governed by the agent you already run.

2026-11-22 · profile personal · static, plus an install in a throwaway repo copy · source https://github.com/d0whc3r/spec-kit-tdd (commit 55221d4), release zip v2.0.1

## What it does with your data

Installed, it adds four commands (`setup`, `plan`, `run`, `verify`), four reference templates and four hooks to spec-kit. The commands instruct the agent to read the repo, run its test suite, edit tests and source, and write `.specify/memory/tdd-profile.md` and per-feature `tdd/*.md` files. All inside the repository.

| Your data | How it gets it | Stays local? | Goes to |
|---|---|---|---|
| Repo code and test output | the agent reads and runs it | yes, in the repo | only the model service of the agent you chose |

## Where it connects

None in the installed files. The scanner's hosts are docs, a website (`web/`), dev-only skills under `.agents/` and release scripts (`.github/scripts/submit-catalog-update.mjs` fetches a catalog URL); none of these are installed by `specify extension add`. Verified: the installed `.specify/extensions/tdd/` contains `commands/`, `templates/`, `extension.yml`, `README.md`, `LICENSE` only.

## What it keeps on this machine

Under `.specify/extensions/tdd/`, `.claude/skills/speckit-tdd-*`, `.specify/extensions.yml`, `.specify/memory/tdd-profile.md`. All in the repo, so committed if you commit them.

## Findings

### 1. Rule against prompt injection (note)

`commands/speckit.tdd.setup.md:61` tells the agent to treat repo content as data and not follow injected instructions. Benign.

### 2. A mandatory hook (note)

`before_implement` runs the TDD loop and is non-optional by design (`extension.yml`); disable with `enabled: false` in `.specify/extensions.yml`.

## Making it safer

Pin to the v2.0.1 release; when running headless, give the agent only the test commands it needs (`--allowedTools`).

## Coverage

- Read: `extension.yml`, all four commands and templates (grepped for network, secrets, upload terms), README install section, scanner leads. The dev-only `.agents/` skills and `web/` were scanned, not read fully.
- Dependencies: dev tooling only (semantic-release, husky); not shipped.
- Dynamic check: installed into a copy of this repo and ran the setup command; it wrote only the profile file.
- Would change the verdict: nothing foreseen.
