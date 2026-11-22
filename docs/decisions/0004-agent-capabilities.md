# 0004. Agent capabilities: Claude Code, Copilot CLI, agy

Status: accepted (2026-11-22), with a verify-first list for Task 5. Read by Tasks 4, 5 and 9.

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
| Hook scoped to one subagent | `hooks:` in subagent frontmatter, only while it runs (docs) | `hooks` in custom-agent frontmatter (docs) | none documented |
| Path write rules | `permissions.deny: ["Edit(docs/**)"]` covers built-in edit tools, not shell commands (docs) | `--deny-tool='write(path/**)'`, deny beats allow; not shell (docs, `copilot help permissions`) | `permissions.deny: ["write_file(path)"]` in user settings only (docs) |
| Copilot code review on PRs | | The owner's plan does include Copilot code review on pull requests, per https://docs.github.com/en/copilot/get-started/plans (plans table, Agents section) | |

Note for hook authors: Copilot's edit tool was `apply_patch` with `toolArgs` as a patch string, while `bash` has an object; agy's was `write_file` with `toolCall.args`. Match on all tools and inspect the arguments rather than relying on one tool name.

## Decision

- **Edit-time blocking (Task 5):** option 1. Claude Code: `PreToolUse` hook (plus `Edit(...)` deny rules). Copilot: a committed `.github/hooks/*.json` `preToolUse` hook, with headless runs started with `--trust-folder`. agy: a committed `.agents/hooks.json` `PreToolUse` hook (user-settings deny rules are an optional extra, since they cannot be committed). Hooks can be generated by lefthook's beta `ai:` block for Claude and Copilot (0001) but must not depend on it (it has no agy provider). The pre-commit gate remains the backstop for writes made through shell commands.
- **Per-subagent restriction:** Claude Code and Copilot via frontmatter hooks (docs only, see verify-first). Do not rely on subagent scoping for agy; there, enforce by the repo-level hook and the gate.
- **Capture route (Task 9):** Claude: `SessionEnd` and `PreCompact` read `transcript_path`. Copilot: `sessionEnd` gives only `sessionId`, so read `~/.copilot/session-state/<sessionId>/events.jsonl` (it also has `session.usage_record` token counts); `preCompact` and `agentStop` give `transcriptPath`. agy: no session-end; use the `Stop` hook's `transcriptPath` (per turn; take the last), or the `--output-format json` result from a headless run. Transcripts hold the user's prompts and files, so capture stays local and is never committed.

## Verify first in Task 5 (docs-only facts)

1. Claude subagent-frontmatter and Copilot custom-agent `hooks` actually scope to one agent.
2. `Edit(...)` deny rules (Claude), `--deny-tool='write(...)'` (Copilot) and `write_file(...)` deny rules (agy) block edits to a denied path.
3. Copilot `preToolUse` block works for every edit tool Copilot may choose (only `apply_patch` and `bash` were seen), and hook timeouts are set long enough, since a timeout fails open (verified above).
4. agy hook behaviour on the current agy release (installed 1.5.9, docs and changelog describe newer).
5. agy accepts an image path in the prompt, if agy is used for CV checks.

## Evidence

- https://code.claude.com/docs/en/hooks , https://code.claude.com/docs/en/sub-agents , https://code.claude.com/docs/en/permissions
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks , https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli , https://docs.github.com/en/copilot/reference/hooks-configuration
- https://antigravity.google/docs/hooks , https://antigravity.google/docs/subagents , https://antigravity.google/docs/permissions
- `claude --help`, `copilot --help`, `copilot help permissions`, `agy --help`, `agy changelog`, and the probe runs above. The docs pages were summarised by a fetch tool, not read verbatim.

## Privacy-audit verdict

Not applicable: no tool is adopted by this ADR. The agent CLIs are the services this toolkit calls. The probe runs used `--disable-client-telemetry` for Copilot; no Copilot hook runs other than the probe hooks were executed.
