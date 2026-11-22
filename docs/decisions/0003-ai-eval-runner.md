# 0003. AI eval runner: promptfoo or a thin runner in `gate`

Status: **proposed, pending owner decision.** The privacy audit verdict is "Needs your decision", so Task 6 must not wire up an eval runner until the owner picks Option A or B below.

## Context

CV rendering checks are judged by a model against a rubric, locally only (`claude -p`, `copilot -p` or `agy`; CI holds no AI tokens; no third-party API key). The runner takes a rubric prompt and an image path and must yield `{score, passes, issues, tokens}`.

## Options

**A. promptfoo 0.126.0** (MIT, 27.5k stars, frequent releases), exact-pinned, installed `--ignore-scripts`, run only through a `gate` wrapper.
**B. Thin runner inside `gate`**, no third-party dependency: for each case, render the rubric prompt, call the agent CLI, parse the reply. Input: `{rubric, imagePath, agent}`. Output: `{score, passes, issues, tokens}` JSON. The agent is asked for a JSON reply `{score: 0-1, passes: bool, issues: string[]}`; `gate` validates it, retries once on invalid JSON, and fills `tokens` from the CLI's own usage output (see below). About 100 lines; no telemetry surface.

## Hands-on results (scratch directory)

- `npm install promptfoo@0.126.0 --ignore-scripts` works (577 packages). **run**
- An `exec:` provider wrapper receives the rendered prompt as `$1`. With "Read the image file at <path> ...", `claude -p --allowedTools Read --model haiku` answered `red` for a generated red PNG and the assertion passed; the same worked with `copilot -p ... -s --allow-tool=read --add-dir <dir>`. **run**
- `llm-rubric` can use an `exec:` grader via `defaultTest.options.provider`, so no OpenAI key is needed. **run**

### Mapping promptfoo output to the contract

- `score` = `gradingResult.score`; `passes` = `gradingResult.pass`; `issues` = the `reason` of every failed entry in `gradingResult.componentResults`. **run** (fields seen in `--output` JSON)
- `tokens`: promptfoo reports `tokensUsed` zeros for `exec:` providers, and the exec provider treated JSON stdout as plain text (a wrapper that printed `{"output":..., "tokenUsage":...}` produced the whole JSON string as the output and `tokenUsage` empty). **run** So token counts must be captured out of band: the wrapper prints only the answer text and appends the CLI's usage to a side file named by an env var, which `gate` sums. The usage sources, all **run**:
  - Claude Code: `claude -p --output-format json` returns `usage.{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}` and `total_cost_usd`. (`--output-format text` carries none, which is why the first runs showed zero.)
  - Copilot CLI: `--output-format json` JSONL ends with a `result` record containing only `usage.premiumRequests` and timing. Token counts are in the session file `~/.copilot/session-state/<sessionId>/events.jsonl`, in `session.usage_record` events (`inputTokens`, `outputTokens`, `cacheReadTokens`, `reasoningTokens`) and the closing `session.shutdown` event.
  - agy: `--output-format json` returns `usage.{input_tokens, output_tokens, thinking_tokens, total_tokens}`.
  The side-file wrapper itself was not run; verify it first in Task 6.

## Telemetry and remote features (verified through a blocking proxy)

With defaults, one eval connected to `api.promptfoo.dev` (update check), `a.promptfoo.app` (PostHog) and `r.promptfoo.app` (events: random user id, and the email if one is set). Setting `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`, `PROMPTFOO_DISABLE_SHARING=1`, `PROMPTFOO_DISABLE_REMOTE_GENERATION=1` and a local `PROMPTFOO_CONFIG_DIR` stops all but one request: a "telemetry disabled" event (user id, OS, Node version; no prompts or outputs) to `r.promptfoo.app` is still sent (unguarded send in `telemetry-*.js`). Running promptfoo with `HTTPS_PROXY`/`HTTP_PROXY` set to a closed local port prevents it leaving the machine; the exec wrapper scripts must unset the proxy variables before calling the agent CLI (tested: agents still work).

## Decision

Recommendation: Option A with the lock-down, because it gives rubric assertions and reports for free and the leak is contained. **It is the owner's call**: accepting A means accepting the dead-proxy workaround and that, without it, one content-free event per run reaches `r.promptfoo.app`. Option B has no such surface and costs a small amount of code; it is the pick if the owner will not accept the workaround or the 577-package dependency tree (which Task 6 would isolate in its own package folder). Until the owner decides, no task adds promptfoo or the thin runner.

## Evidence

- https://github.com/promptfoo/promptfoo, npm tarball `promptfoo@0.126.0` (`telemetry-*.js`, update check in `main.js`)
- Exec provider docs: https://www.promptfoo.dev/docs/providers/custom-script/ (not fetched)

## Privacy-audit verdict

Needs your decision (default-on telemetry; opt-out leaves one content-free event; many unused AI-provider clients bundled). Report: [audits/promptfoo.md](audits/promptfoo.md). Follow-up: a sandbox run to confirm no other outbound traffic during a full eval.
