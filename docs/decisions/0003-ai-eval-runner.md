# 0003. AI eval runner: promptfoo or a thin runner in `gate`

Status: **accepted (2026-11-22): Option A, promptfoo**, with the conditions under "Owner decision" below. Task 6 wires it up; Task 5 does not.

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

Recommendation: Option A with the lock-down, because it gives rubric assertions and reports for free and the leak is contained. **It is the owner's call**: accepting A means accepting the dead-proxy workaround and that, without it, one content-free event per run reaches `r.promptfoo.app`. Option B has no such surface and costs a small amount of code; it is the pick if the owner will not accept the workaround or the 577-package dependency tree (which Task 6 would isolate in its own package folder).

### Owner decision (2026-11-22)

The owner chose **Option A (promptfoo)**, to learn from it, in this order of preference:

1. **Config and env only.** Block telemetry, update checks, sharing and remote generation with promptfoo's own settings (the `PROMPTFOO_DISABLE_*` variables and a local `PROMPTFOO_CONFIG_DIR`, above).
2. **Dead-proxy wrapper only if needed.** Use the wrapper (proxy variables pointed at a closed local port, unset again before the agent CLI runs) only if a residual event still leaves the machine after step 1. The 0.126.0 run above saw one such event; Task 6 re-tests this on the version it pins before deciding.

Promptfoo is **not cleared for the work laptop**. There, Option B (an own thin runner inside `gate`) is the likely route, built after learning from how promptfoo is used here.

## Addendum (Task 5): does an adopted tool already give a per-task verdict?

Checked before building `gate` (verdict, tree hash, checks runner, verify):

- **spec-kit and spec-kit-tdd 2.0.1** (0002): `/speckit.tdd.verify` writes `specs/<feature>/tdd/verification.md` with a verdict (`PASS`, `PASS_WITH_GAPS`, `FAIL`, `BLOCKED`) per feature. It is an agent-written audit of TDD discipline. It is not bound to a tree, records no hash, and runs no checks. Nothing in `.specify/` computes or checks a tree hash (searched for `verdict`, `tree`, `ls-tree`, `write-tree`).
- **promptfoo** (this ADR): writes eval results (`--output` JSON) per run. They have no task id or tree hash, and it runs only model evals.
- **lefthook 2.2.2** (0001): runs hook jobs and reports pass or fail at the time. It keeps no verdict, so CI cannot check that the hooks ran on the tree being merged.

None of them gives a stored, per-task verdict tied to the exact tree, so `gate` builds only that layer. It runs the adopted tools as checks: Vitest, Playwright, axe through `@axe-core/playwright`, gitleaks, lychee, and later promptfoo. It records their exit status and writes `.gate/<id>/verdict.json` with a hash of the tree minus `.gate/`. Then `gate verify` (CI) compares that hash with the tree being merged. The TDD verdict from spec-kit-tdd stays a separate, advisory report.

## Evidence

- https://github.com/promptfoo/promptfoo, npm tarball `promptfoo@0.126.0` (`telemetry-*.js`, update check in `main.js`)
- Exec provider docs: https://www.promptfoo.dev/docs/providers/custom-script/ (not fetched)

## Privacy-audit verdict

Needs your decision (default-on telemetry; opt-out leaves one content-free event; many unused AI-provider clients bundled). Report: [audits/promptfoo.md](audits/promptfoo.md). Follow-up: a sandbox run to confirm no other outbound traffic during a full eval.

## Addendum (Task 6): lock-down re-tested on the pinned version, and how it is wired

promptfoo 0.126.0 is installed in its own folder, `evals/` (own `package.json` and lockfile, exact pin, `npm ci --ignore-scripts`), not in the site's dependencies. It is run only through `evals/run.ts` (`npm run eval:critic`, `eval:auditor`, `eval:calibrate`).

- **Config and env only (step 1 of the owner's order): one event still leaves.** **run.** One eval (the design-critic suite, one pair, `claude:haiku`) ran with `PROMPTFOO_DISABLE_TELEMETRY`, `_UPDATE`, `_SHARING`, `_SHARE_EMAIL_REQUEST`, `_REMOTE_GENERATION` and `_REDTEAM_REMOTE_GENERATION` set to 1, a local `PROMPTFOO_CONFIG_DIR`, `--no-write` and `--no-cache`, with `HTTP(S)_PROXY` pointing at a local logging proxy that answers every request with 403. The proxy logged exactly one request from promptfoo: `CONNECT r.promptfoo.app:443`. No other host was contacted. This matches the code: in `telemetry-*.js`, `record()` calls `recordTelemetryDisabled()` when telemetry is disabled, which calls `sendEvent()`, which posts to the hard-coded `R_ENDPOINT` (`https://r.promptfoo.app/`) with no guard. No setting turns that off (`IS_TESTING` only skips the PostHog client, not this post).
- **So the dead-proxy wrapper is used (step 2).** `evals/run.ts` starts promptfoo with `HTTP_PROXY`/`HTTPS_PROXY` set to `http://127.0.0.1:9` (a closed port). promptfoo's `fetchWithProxy` sends through an undici `ProxyAgent` whenever a proxy is set for the URL, with no direct fallback, so the event cannot leave the machine. The agent CLIs must still reach their own services, so the provider (`evals/provider.mjs`) and `tools/gate/ai-agent.ts` remove every proxy variable from the agent subprocess environment. **run**: the calibration below ran this way, and all three agent CLIs answered. `EVALS_PROXY=<url>` points promptfoo at a different proxy (used for the logging check above); `EVALS_PROXY=none` turns it off.
- **Tokens: a JS provider, not an `exec:` provider.** **run.** Instead of the side-file design above, the provider is a promptfoo custom JavaScript provider (`file://../provider.mjs`). It runs `tools/gate/ai-eval.ts case <eval> <case>` (the same code the gate check runs) and returns the agent CLI's own counts as `tokenUsage`, which promptfoo adds up in its summary and `--output` JSON. The counts come from `claude --output-format json` `usage` (input = fresh + cache-write + cache-read), agy's `usage` (thinking tokens count as output), and Copilot's `session.usage_record` events in `~/.copilot/session-state/<sessionId>/events.jsonl`.
- **Gate checks call the agent directly.** `gate`'s `design-critic` and `auditor` checks run `tools/gate/ai-eval.ts` without promptfoo (simpler for one call, and no telemetry surface at gate time). Calibration runs through promptfoo, and both paths share the same prompt builder, agent runner and reply parser.
- **Agent CLIs run read-only and bare.** Claude: `--safe-mode --tools Read[,Grep,Glob] --strict-mcp-config --disable-slash-commands --no-session-persistence` (this cut one image prompt from about 69k to about 10k input tokens, because user plugins and MCP servers are not loaded). Copilot: `--available-tools=view[,glob,grep] --allow-tool=read --disable-client-telemetry --no-custom-instructions --disable-builtin-mcps --no-ask-user`. agy: `--disable-slash-commands`. Image paths in the prompt work for all three (**run**; agy image prompts were untested before, see 0004).
- **One unguarded run.** While setting up, `npx promptfoo --version` was run once in `evals/` without the lock-down env. It may have made an update check. Every eval run since has used `evals/run.ts`.

Promptfoo stays **not cleared for the work laptop** (`evals/README.md` says so).

### Evidence: other tools used in Task 6 (not dependencies of the site)

- **Playwright Linux image `mcr.microsoft.com/playwright:v1.65.1-noble`**, Microsoft's official image for the installed `@playwright/test` 1.65.1. It is used only to render the visual baselines and run the visual suite (`scripts/visual.sh` locally, the CI `visual` job), so that macOS and CI render the same pixels. It is pulled by its exact version tag, and CI checks that the tag matches the installed package. It has no access to AI tokens or private data: it gets the repository checkout only.
- **fontTools 4.60.1 (`pyftsubset`) through `uvx`**, used once (**run**) to subset the OFL fonts to Latin and convert them to woff2. Only the output files are committed (`public/fonts/`). Nothing installs or runs it in the build, the tests or CI.
