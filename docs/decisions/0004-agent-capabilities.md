# 0004. Agent capabilities: Claude Code, Copilot CLI, agy

Status: accepted (2026-11-22). Read by Tasks 4, 5 and 9.

Each fact is marked **run** (verified by running the installed CLI) or **docs** (from the linked page, not executed).

## Context

Tasks 4, 5 and 9 need subagents, edit-time blocking, and a capture route for each agent, with a Copilot route for everything. Installed: Claude Code 2.1.323, Copilot CLI 1.0.112, agy 1.5.9.

## Facts

| | Claude Code | Copilot CLI | agy |
|---|---|---|---|
| Headless | `claude -p "<prompt>" --output-format json` returns one JSON object with result, session id and cost (run). `--output-format stream-json` and `--json-schema` also exist (help) | `copilot -p "<prompt>" -s` prints only the answer (run). `--output-format json` prints JSONL events ending with a `result` record (run). Needs `--allow-tool=...` or `--no-ask-user` to avoid prompts (help) | `agy -p "<prompt>" --output-format json` returns `{status, response, usage}` (run). `text`, `stream-json`, `--json-schema` also exist (help) |
| Image path in prompt | Worked with `--allowedTools Read` (run, see 0003) | Worked with `--allow-tool=read --add-dir` (run, see 0003) | Not tested |
| Subagents | Markdown with YAML frontmatter in `.claude/agents/` or `~/.claude/agents/`; fields `tools`, `disallowedTools`, `model`, `permissionMode`, `hooks`, `skills`, `maxTurns` (docs) | `.github/agents/*.agent.md` or `~/.copilot/agents/`; fields `tools`, `strict-tools-list`, `model`, `hooks` (docs) | `.agents/agents/<name>.md` or `~/.gemini/config/agents/`; fields `tools`, `model`, `mcpServers`, `skills`; no per-subagent permissions or hooks field (docs) |
| Session-end hook | `SessionEnd` (docs) | `sessionEnd` (docs) | None listed; events are `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` (docs) |
| Pre-compaction hook | `PreCompact` (also `PostCompact`) (docs) | `preCompact` (docs) | None listed |
| Hook scoped to one subagent | Yes: `hooks:` in the subagent frontmatter runs only while it runs; `Stop` becomes `SubagentStop`. Project agents need the folder trusted; ignored for plugin agents (docs) | Yes for custom agents (CLI only): `hooks` in frontmatter runs while that agent is selected; subagent `Stop` maps to `SubagentStop` (docs) | No documented way; hooks are workspace/global/plugin level, filtered only by tool `matcher` |
| Hook config location | `.claude/settings.json`, `~/.claude/settings.json`, plugins | `.github/hooks/*.json` (version 1), `~/.copilot/hooks/` | `.agents/hooks.json`, `~/.gemini/config/hooks.json` |
| Blocking hook | `PreToolUse`: exit 2, or JSON `permissionDecision: "deny"` (docs) | `preToolUse`: exit 2 or JSON `permissionDecision: "deny"`; a timeout fails open (docs) | `PreToolUse`: JSON `decision: "deny"` (docs) |
| Write-path restriction | Deny rules `Edit(docs/**)` cover all built-in edit tools (Write, NotebookEdit). They do not cover shell commands or scripts that write files; OS sandbox needed for that (docs). Per-subagent: a frontmatter `PreToolUse` hook checking `tool_input.file_path` (docs) | `--deny-tool='write(reports/**)'` (globs, deny beats allow) applies to file-edit tools, not to shell commands (help text, run) | `deny: ["write_file(path)"]` in `~/.gemini/antigravity-cli/settings.json`, deny beats ask beats allow (docs); subagents inherit the parent's scopes |

## Decision

- **Edit-time blocking (Task 5):** enforce with Claude Code `Edit(...)` deny rules in `.claude/settings.json`, plus a `PreToolUse` hook script for path checks; Copilot with `preToolUse` hooks in `.github/hooks/` (lefthook's beta `ai:` block can generate both, see 0001) and `--deny-tool` in gate-run invocations. Both are enforceable for the agents' own edit tools but not for writes made through shell commands, so the pre-commit gate remains the backstop. agy: deny rules in user settings only; treat it as advisory and rely on the gate.
- **Per-subagent restriction:** Claude Code and Copilot via frontmatter hooks. For agy, do not rely on subagent scoping.
- **Capture route (Task 9):** Claude Code `SessionEnd`/`PreCompact` and Copilot `sessionEnd`/`preCompact` hooks. agy has no such events, so capture there is by running `agy -p --output-format json` through `gate` and recording the result.
- **Copilot code review on PRs:** the owner's plan does include Copilot code review on pull requests, per https://docs.github.com/en/copilot/get-started/plans (the plans table, "Agents" section).

## Evidence

- https://code.claude.com/docs/en/hooks , https://code.claude.com/docs/en/sub-agents , https://code.claude.com/docs/en/permissions
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks , https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli , https://docs.github.com/en/copilot/reference/hooks-configuration
- https://antigravity.google/docs/hooks , https://antigravity.google/docs/subagents , https://antigravity.google/docs/permissions
- `claude --help`, `copilot --help`, `copilot help permissions`, `agy --help`, `agy changelog`

## Privacy-audit verdict

Not applicable: no tool is adopted by this ADR. The agent CLIs are already installed and are the services this toolkit calls; the Copilot hooks and `--disable-client-telemetry` flag were used in the spike runs.
