# 0002. spec-kit-tdd: adopt, pinned, with an independent gate check

Status: accepted with concerns (2026-11-22). Read by Tasks 4 and 5.

## Context

Feature work runs through spec-kit. The wanted flow is: test list from acceptance criteria, failing tests committed first, implementation, then a cold-context audit. The choice is to adopt `d0whc3r/spec-kit-tdd` or build a thin equivalent.

## Options

1. Adopt spec-kit-tdd v2.0.1.
2. Build a thin equivalent (four prompts plus a gate check).

Facts about the extension (2026-11-22): 10 stars, 21 open issues, MIT, created 2026-08-03, latest release v2.0.1 on 2026-10-24 (v2.0.0 the same day), one maintainer. It requires spec-kit `>=0.12.17`; the installed `specify` is 1.2.4. It is four markdown command files and four templates, with no code that runs. Commands: `setup` (detect and prove the test commands), `plan` (test list from `spec.md`/`plan.md`), `run` (red-green-refactor, evidence in `tdd/cycle-log.md`), `verify` (cold-context audit, test-first evidence from git history, mutation checks where a tool exists).

Hands-on, in a throwaway copy of this repo: `specify init --here --integration claude`, then `specify extension add tdd --from <release zip>` (asks to confirm an untrusted URL), then the setup command. The installed copy matched the audited source. Install writes `.claude/skills/speckit-tdd-*`, `.specify/extensions/tdd/`, and `.specify/extensions.yml` (four hooks). Setup writes only `.specify/memory/tdd-profile.md` (127 lines): it ran the suite (green, about 3 s), found the Playwright single-test command, and set `single: null` for Vitest because no unit test exists yet. Findings:
- In Claude Code the commands are skills named `/speckit-tdd-setup`, not `/speckit.tdd.setup`.
- Headless `claude -p` with only `--permission-mode acceptEdits` cannot run the suite, so the profile was not written. It needed `--allowedTools` for `npm run`, `npx vitest` and `npx playwright`.
- The `before_implement` hook is non-optional by design; it can be disabled in `.specify/extensions.yml`.

## Decision

Adopt, pinned to the v2.0.1 release zip (verify the zip against the audited source when upgrading). Keep one thing outside the extension: the `gate` command independently checks test-first evidence (failing test commit precedes the implementation commit) instead of trusting `cycle-log.md`, because the extension runs the loop in a single agent and does not separate test author from implementer. If the extension is abandoned, the audited prompts can be forked; they are plain markdown.

Concerns: very young, single-maintainer project; spec-kit's own scaffolding (`.claude/skills/speckit-*`, `.specify/`) is a large footprint in a small public repo; Copilot parity is by spec-kit's Copilot integration and was not tested here.

## Evidence

- https://github.com/d0whc3r/spec-kit-tdd (README, `extension.yml`, `commands/`)
- Spec Kit: https://github.com/github/spec-kit

## Privacy-audit verdict

Local only. Markdown prompts and templates; no network code, telemetry or hidden instructions in the shipped files (the one flagged line is a rule telling the agent to ignore injected instructions). The dev-only `.agents/` folder and `web/` site in the repo are not part of the installed extension. Report: [audits/spec-kit-tdd.md](audits/spec-kit-tdd.md).
