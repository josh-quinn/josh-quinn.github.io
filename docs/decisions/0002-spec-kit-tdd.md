# 0002. spec-kit-tdd: adopt, pinned, with an independent gate check

Status: accepted with concerns (2026-11-22). Read by Tasks 4 and 5. Installed in Task 4 (see Task 4 install and Copilot check below).

## Context

Feature work runs through spec-kit. The wanted flow is: test list from acceptance criteria, failing tests committed first, implementation, then a cold-context audit. The choice is to adopt `d0whc3r/spec-kit-tdd` or build a thin equivalent.

## Options

1. Adopt spec-kit-tdd v2.0.1.
2. Build a thin equivalent (four prompts plus a gate check).

Facts about the extension (2026-11-22): 10 stars, 21 open issues, MIT, created 2026-08-03, latest release v2.0.1 on 2026-10-24 (v2.0.0 the same day), one maintainer. Commit activity (GitHub API): 32 commits on the default branch, all between 2026-08-03 and 2026-10-24 (5 in the last 30 days before that date, none since 2026-11-01); the repo was last pushed to on 2026-11-19. The 21 open items are 1 issue and 20 pull requests. It requires spec-kit `>=0.12.17`; the installed `specify` is 1.2.4. It is four markdown command files and four templates, with no code that runs. Commands: `setup` (detect and prove the test commands), `plan` (test list from `spec.md`/`plan.md`), `run` (red-green-refactor, evidence in `tdd/cycle-log.md`), `verify` (cold-context audit, test-first evidence from git history, mutation checks where a tool exists).

Hands-on, in a throwaway copy of this repo: `specify init --here --integration claude`, then `specify extension add tdd --from <release zip>` (asks to confirm an untrusted URL), then the setup command. The installed copy matched the audited source. Install writes `.claude/skills/speckit-tdd-*`, `.specify/extensions/tdd/`, and `.specify/extensions.yml` (four hooks). Setup writes only `.specify/memory/tdd-profile.md` (127 lines): it ran the suite (green, about 3 s), found the Playwright single-test command, and set `single: null` for Vitest because no unit test exists yet. Findings:
- In Claude Code the commands are skills named `/speckit-tdd-setup`, not `/speckit.tdd.setup`.
- Headless `claude -p` with only `--permission-mode acceptEdits` cannot run the suite, so the profile was not written. It needed `--allowedTools` for `npm run`, `npx vitest` and `npx playwright`.
- The `before_implement` hook is non-optional by design; it can be disabled in `.specify/extensions.yml`.

Copilot route (verified in a second throwaway copy): `specify init --here --integration copilot`, then the same `extension add`, registers the four commands as skills under `.github/skills/speckit-tdd-*`. `copilot --trust-folder -p "/speckit-tdd-setup --no-constitution" --allow-tool='shell(npm:*)' --allow-tool='shell(npx:*)' --allow-tool=write --allow-tool=read` discovered the skill, wrote `.specify/memory/tdd-profile.md`, and stopped at verification only because that copy had no `node_modules` (the extension never installs dependencies). The plan, run and verify commands were not run through Copilot.

## Decision

Adopt, pinned to the v2.0.1 release zip (verify the zip against the audited source when upgrading). Keep one thing outside the extension: the `gate` command independently checks test-first evidence (failing test commit precedes the implementation commit) instead of trusting `cycle-log.md`, because the extension runs the loop in a single agent and does not separate test author from implementer. If the extension is abandoned, the audited prompts can be forked; they are plain markdown.

Concerns: very young, single-maintainer project; spec-kit's own scaffolding (`.claude/skills/speckit-*`, `.specify/`) is a large footprint in a small public repo; the Copilot route is verified only for install and `setup`; running `plan`/`run`/`verify` under Copilot was an open requirement for Task 4; the Task 4 check below shows the commands resolve, but a full run through Copilot is still not done. If a full run fails, the fallback is the thin equivalent (test list from acceptance criteria, failing tests committed by a test-author step, implementation, cold-context audit) built on the Task 4 role agents.

## Task 4 install and Copilot check (2026-11-22)

- **run:** `specify init --here --force --non-interactive --integration claude --ignore-agent-tools`, then `specify integration install copilot --force` (a second integration needs `--force`; the default stays `claude`). Spec Kit 1.2.4 writes `.specify/`, `.claude/skills/speckit-*` and `.github/skills/speckit-*`. Its skills are named `speckit-<step>` (hyphen), not `/speckit.<step>`.
- **run:** the `archive/refs/tags/v2.0.1.zip` source archive is rejected by `specify extension add` ("Unsafe symlink in ZIP archive"). The release asset works: `specify extension add tdd --from https://github.com/d0whc3r/spec-kit-tdd/releases/download/v2.0.1/tdd-2.0.1.zip`. Its sha256 is `bdae2f8d6582767c47c1758ed3204d23d41b83e666e0165830720b97b7212726`, identical to the digest GitHub publishes for that release asset. Re-check the digest when upgrading.
- The install registered `speckit-tdd-setup`, `-plan`, `-run` and `-verify` under both `.claude/skills/` and `.github/skills/`, and `.specify/extensions.yml` with four hooks.
- **run (Copilot):** `copilot -p "<list custom agents and speckit-tdd skills by name>" -s --disable-client-telemetry --trust-folder --no-ask-user` listed `speckit-tdd-setup`, `speckit-tdd-plan`, `speckit-tdd-run` and `speckit-tdd-verify`. So plan, run and verify are available from Copilot CLI. Gap that remains: they were only resolved, not executed end to end, under Copilot. Task 8 runs them for real; if that fails the thin fallback above applies.

## Evidence

- https://github.com/d0whc3r/spec-kit-tdd (README, `extension.yml`, `commands/`)
- Spec Kit: https://github.com/github/spec-kit

## Privacy-audit verdict

Local only. Markdown prompts and templates; no network code, telemetry or hidden instructions in the shipped files (the one flagged line is a rule telling the agent to ignore injected instructions). The dev-only `.agents/` folder and `web/` site in the repo are not part of the installed extension. Report: [audits/spec-kit-tdd.md](audits/spec-kit-tdd.md).
