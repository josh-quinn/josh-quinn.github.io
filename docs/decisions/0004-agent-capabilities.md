# 0004. Agent capabilities: Claude Code, Copilot CLI, agy

Status: accepted (2026-11-22). Verify-first list resolved in Task 5 (see below). Read by Tasks 4, 5 and 9.

Each fact is marked **run** (verified by running the installed CLI in a scratch directory with probe hooks) or **docs** (from the linked page, not executed). Installed: Claude Code 2.1.323, Copilot CLI 1.0.112, agy 1.5.9 (its changelog already lists 1.5.14, so the online docs may describe newer behaviour).

## Context

Tasks 4, 5 and 9 need subagents, edit-time blocking and a capture route for each agent, with a Copilot route for everything.

## Options

1. Agent-native hooks and deny rules per agent, with the pre-commit gate as backstop.
2. The gate only (no edit-time blocking); simplest, but problems are found at commit time, not edit time.
3. One tool (lefthook's beta `ai:` block, see 0001) generating the Claude and Copilot hook config; no agy provider.

## Capabilities

| | Claude Code | Copilot CLI | agy |
|---|---|---|---|
| Headless | `claude -p "<prompt>" --output-format json`: one JSON object with `result`, `session_id`, `total_cost_usd`, `usage` (input, cache, output tokens) (run) | `copilot -p "<prompt>" -s` prints the answer only; `--output-format json` prints JSONL ending in a `result` record with only `usage.premiumRequests` (run) | `agy -p "<prompt>" --output-format json`: `{conversation_id, status, response, usage{input,output,thinking,total tokens}}` (run) |
| Image path in prompt | worked with `--allowedTools Read` (run, 0003) | worked with `--allow-tool=read --add-dir` (run, 0003) | not tested |
| Subagents | `.claude/agents/*.md`, `~/.claude/agents/`; frontmatter `tools`, `disallowedTools`, `model`, `permissionMode`, `hooks`, `skills` (docs) | `.github/agents/*.agent.md`, `~/.copilot/agents/`; `tools`, `strict-tools-list`, `model`, `hooks` (docs) | `.agents/agents/<name>.md`, `~/.gemini/config/agents/`; `tools`, `model`, `mcpServers`, `skills`; no permissions or hooks field (docs) |
| Hook config | `.claude/settings.json`, `~/.claude/settings.json`, plugins | `.github/hooks/*.json` (`version: 1`), `~/.copilot/hooks/`. In `-p` mode repo hooks are skipped ("folder_not_trusted") unless `--trust-folder` is passed (run) | `.agents/hooks.json` (loaded in headless `-p`, run), `~/.gemini/config/hooks.json` |
| Session end | `SessionEnd` (run). Stdin: `session_id`, `transcript_path` (JSONL under `~/.claude/projects/...`), `cwd`, `prompt_id`, `hook_event_name`, `reason` | `sessionEnd` (run). Stdin: `sessionId`, `timestamp`, `cwd`, `reason` ("complete"); **no transcript path**. Session file is `~/.copilot/session-state/<sessionId>/events.jsonl` (run) | No session-end event. `Stop` fires at each turn end (run). Stdin: `conversationId`, `transcriptPath` (`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript_full.jsonl`), `terminationReason`, `lastUserInput`, `fullyIdle` |
| Pre-compaction | `PreCompact` (run, via `/compact`). Stdin: `session_id`, `transcript_path`, `cwd`, `trigger` ("manual"/auto), `custom_instructions` | `preCompact` (run, via `/compact`). Stdin: `sessionId`, `cwd`, `transcriptPath` (the `events.jsonl`), `trigger`, `customInstructions` | none |
| Other stop events | `Stop` (has `last_assistant_message`, `transcript_path`) (run) | `agentStop` has `transcriptPath` and `stopReason` (run) | `SessionStart`, `PreInvocation`, `PostInvocation` (docs) |
| Blocking hook | `PreToolUse` exit 2 blocked a `Write` call; the agent reported the hook's stderr (run) | `preToolUse` printing `{"permissionDecision":"deny","permissionDecisionReason":...}` blocked both `apply_patch` (file edits) and `bash` calls; nothing was created (run). A hook that exceeds `timeoutSec` fails open: the file was created (run) | `PreToolUse` printing `{"decision":"deny","reason":...}` from repo-level `.agents/hooks.json` blocked `write_file`; the agent reported "denied by pre-tool hook" (run) |
| Hook scoped to one subagent | `hooks:` in subagent frontmatter, only while it runs (docs; not used, see Task 5 results) | `hooks` in custom-agent frontmatter (docs; not used) | none documented |
| Path write rules | `permissions.deny: ["Edit(docs/**)"]` covers built-in edit tools, not shell commands (docs) | `--deny-tool='write(path/**)'`, deny beats allow; not shell (docs, `copilot help permissions`) | `permissions.deny: ["write_file(path)"]` in user settings only (docs) |
| Copilot code review on PRs | | The owner's plan does include Copilot code review on pull requests, per https://docs.github.com/en/copilot/get-started/plans (plans table, Agents section) | |

Note for hook authors: Copilot's edit tool was `apply_patch` with `toolArgs` as a patch string, while `bash` has an object; agy's was `write_file` with `toolCall.args`. Match on all tools and inspect the arguments rather than relying on one tool name.

## Decision

- **Edit-time blocking (Task 5):** option 1. Claude Code: `PreToolUse` hook (plus `Edit(...)` deny rules). Copilot: a committed `.github/hooks/*.json` `preToolUse` hook, with headless runs started with `--trust-folder`. agy: a committed `.agents/hooks.json` `PreToolUse` hook (user-settings deny rules are an optional extra, since they cannot be committed). Hooks can be generated by lefthook's beta `ai:` block for Claude and Copilot (0001) but must not depend on it (it has no agy provider). The pre-commit gate remains the backstop for writes made through shell commands.
- **Per-subagent restriction:** not used (Task 5). Scoped hooks cannot lift a global deny, so the test-author exemption is the `GATE_TEST_AUTHOR=<task-id>` env var on its own agent process, and enforcement is the repo-level hook plus CI.
- **Capture route (Task 9):** Claude: `SessionEnd` and `PreCompact` read `transcript_path`. Copilot: `sessionEnd` gives only `sessionId`, so read `~/.copilot/session-state/<sessionId>/events.jsonl` (it also has `session.usage_record` token counts); `preCompact` and `agentStop` give `transcriptPath`. agy: no session-end; use the `Stop` hook's `transcriptPath` (per turn; take the last), or the `--output-format json` result from a headless run. Transcripts hold the user's prompts and files, so capture stays local and is never committed.

## Verify first in Task 5: results

Task 5 used Claude Code 2.1.323, Copilot CLI 1.0.112 and agy 1.5.9 (the same versions as above).

1. **Per-subagent hook scoping: not used, not run.** Frontmatter `hooks:` add hooks while a subagent runs. They cannot remove a project-wide hook, so they cannot exempt the test author from a global deny. The exemption is an env var instead: the test-author step is started as its own agent process with `GATE_TEST_AUTHOR=<task-id>`. The hook then allows writes under `tests/acceptance/<task-id>/` only. **run** (Claude): with `GATE_TEST_AUTHOR=T1`, a `Write` to `tests/acceptance/T1/a.spec.ts` was allowed and created the file. A `Write` to `tests/acceptance/T2/b.spec.ts` in the same session was denied. So the hook process inherits the agent's environment. Copilot and agy inheritance: not run.
2. **Path deny rules: not used, not run.** `Edit(...)` deny rules, `--deny-tool='write(...)'` and agy `write_file(...)` rules have no exception for the test author, so they would block it as well. The shared hook is the only edit-time mechanism.
3. **Copilot `preToolUse` across edit tools:** **run**. In this repo the committed `.github/hooks/gate-guard.json` denied `apply_patch` for `.gate/x` (`--trust-folder` given) and let `bash` (`git status`) run. `apply_patch` was the only edit tool Copilot chose in all runs. The guard also handles other edit tools: known names (`edit`, `create`, `str_replace_editor`, ...) are checked by their path field. Any unknown tool whose arguments name a protected path is denied (fail closed). Timeout: `timeoutSec: 30`, and the guard runs in about 80 ms (**run**). A timeout would fail open.
4. **agy on the installed release:** **run** with 1.5.9. The committed `.agents/hooks.json` `PreToolUse` hook denied `write_file` for `.gate/x` and let `run_command` run. agy runs hooks with `.agents/` as the working directory, so the command is `node ../tools/gate/guard.ts` (**run**: a repo-relative path failed with "Cannot find module"). That failing hook blocked the tool call, so agy fails closed on hook errors (**run**). In 1.5.9 the edit tool is `write_file` with `args.Path`, while the docs list `write_to_file` with `TargetFile`; the guard handles both. Headless `run_command` also needs a session allow rule (`--settings '{"permissions":{"allow":["command(...)"]}}'`), because `-p` cannot prompt.
5. **agy image prompts:** out of scope for Task 5; Task 6 checks this if it uses agy.

### Hook payloads seen (run)

- Claude `PreToolUse`: `{session_id, transcript_path, cwd, permission_mode, hook_event_name, tool_name, tool_input, tool_use_id}`. `Write` has `tool_input.file_path` (absolute) and `content`; `Bash` has `tool_input.command`.
- Copilot `preToolUse`: `{sessionId, timestamp, cwd, toolCallId, toolName, toolArgs}`. For `apply_patch`, `toolArgs` is the patch text (`*** Add File: .gate/x`, path relative to `cwd`); for `bash` it is an object `{command, description}`.
- agy `PreToolUse`: `{conversationId, cwd, hookEventName, stepIdx, toolCall: {name, id, args}, workspacePaths, transcriptPath, lastUserInput, modelName, artifactDirectoryPath}`. `write_file` has `args.Path` (absolute) and `Content`; `run_command` has `args.CommandLine`.

### Edit-time protection as built (Task 5)

One guard, `tools/gate/guard.ts`, runs under plain `node` without tsx. It is called with `--agent claude|copilot|agy` from `.claude/settings.json` (`PreToolUse`, matcher `*`), `.github/hooks/gate-guard.json` (`preToolUse`) and `.agents/hooks.json` (`PreToolUse`, matcher `*`). It denies:

- writes to `.gate/**`;
- writes to `tests/acceptance/**`, except under the test-author override above;
- shell commands that skip git hooks: `--no-verify`, or `-n` with `git commit` or `git push`, a `LEFTHOOK=0` env prefix or export, or setting `core.hooksPath`;
- shell commands that add a `Gate-Test-Author` trailer outside the test-author step;
- shell commands that visibly write to a protected path: redirects, `rm`/`mv`/`cp`/`tee`/`touch`/..., `sed -i`, `git checkout`/`restore`/`rm`/`clean`, and inline interpreter code (`node -e`, or a heredoc fed to `node`/`python`). It follows `sh -c`, shell heredocs and `cd`.

Reads are allowed, and so is text that only mentions these things, such as a heredoc written to a doc file. Path checks resolve `..` and ignore case (macOS file systems are case-insensitive). The guard fails closed on a payload it cannot parse. Live checks (**run**, all in this repo): each agent was asked to write `.gate/x` and then run `git status`. Each denied the write with the guard's message and ran `git status`, and no `.gate/x` was created. Commands:

- `claude -p "<prompt>" --model haiku --allowedTools Write Bash --max-turns 6`
- `copilot -p "<prompt>" -s --trust-folder --disable-client-telemetry --allow-tool=write --allow-tool='shell(git:*)'`
- `agy -p "<prompt>" --mode accept-edits --settings '{"permissions":{"allow":["command(git status --short lefthook.yml)"]}}'`

### Residual risks

- **Shell analysis is best effort.** Globs (`rm .ga*`), variables, scripts that are written and then run, and commit messages read from a file (`-F`) can get past it. For acceptance tests the guarantee is CI `gate integrity`. For verdicts it is CI `gate verify` plus the CI jobs that re-run build, unit and e2e. A forged verdict would mostly matter for checks that CI cannot re-run: the AI checks (Task 6) and `links`.
- **The trailer is trusted.** `gate integrity` diffs against the latest commit with `Gate-Test-Author: <id>`. The guard blocks agents from writing that trailer, but anyone can write it by hand, so the reviewer checks who made the trailer commit.
- **The override is per process.** `GATE_TEST_AUTHOR` is set by whoever starts the agent. A subagent inside an implementer session inherits the parent's environment, so it cannot receive the exemption. The test-author step must run as its own process.
- **The guard and hook configs are not protected.** An agent could edit `tools/gate/guard.ts` or the three hook files. That shows in the diff, and the reviewer and CI are the backstop.
- **Copilot:** hooks fail open on timeout, and in `-p` mode repo hooks load only with `--trust-folder`.
- **agy:** the `PreToolUse` deny was run on 1.5.9 only. The tool names differ from the docs, which describe newer releases.

## Evidence

- https://code.claude.com/docs/en/hooks , https://code.claude.com/docs/en/sub-agents , https://code.claude.com/docs/en/permissions
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks , https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli , https://docs.github.com/en/copilot/reference/hooks-configuration
- https://antigravity.google/docs/hooks , https://antigravity.google/docs/subagents , https://antigravity.google/docs/permissions
- `claude --help`, `copilot --help`, `copilot help permissions`, `agy --help`, `agy changelog`, and the probe runs above. The docs pages were summarised by a fetch tool, not read verbatim.

## Privacy-audit verdict

Not applicable: no tool is adopted by this ADR. The agent CLIs are the services this toolkit calls. The probe runs used `--disable-client-telemetry` for Copilot; no Copilot hook runs other than the probe hooks were executed. The Task 5 live checks also used `--disable-client-telemetry`; the only hook they ran was the repo's own guard.
