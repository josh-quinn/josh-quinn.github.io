# 0003. AI eval runner: promptfoo, locked down

Status: accepted with concerns (2026-11-22). Read by Task 6. Needs the owner's confirmation of the telemetry workaround.

## Context

CV rendering checks are judged by a model against a rubric, locally only (`claude -p`, `copilot -p` or `agy`; CI holds no AI tokens, and no third-party API key is allowed). The runner takes a rubric prompt and an image path and must yield `{score, passes, issues}`.

## Options

1. promptfoo 0.126.0 (MIT, 27.5k stars, releases every few weeks).
2. A small runner inside `gate` with the same inputs and outputs.

## Hands-on results (scratch directory, telemetry disabled)

- `npm install promptfoo@0.126.0 --ignore-scripts` works (577 packages) and runs.
- An `exec:` provider wrapper script receives the rendered prompt as `$1`. With the prompt "Read the image file at <path> ...", `claude -p --allowedTools Read --model haiku` answered `red` for a generated red PNG, and the assertion passed.
- The same worked for `copilot -p ... -s --allow-tool=read --add-dir <dir>`.
- `llm-rubric` can use an `exec:` grader via `defaultTest.options.provider`, so no OpenAI key is needed. Score and reason come back in `gradingResult`.

## Telemetry and remote features (verified by running through a blocking proxy)

With defaults, one eval connected to `api.promptfoo.dev` (update check), `a.promptfoo.app` (PostHog) and `r.promptfoo.app` (events with a random user id, and the user's email if one is set). Set:

- `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`, `PROMPTFOO_DISABLE_SHARING=1`, `PROMPTFOO_DISABLE_REMOTE_GENERATION=1` (the last also stops red-team remote generation), `PROMPTFOO_CONFIG_DIR=<local dir>`.
- Even with all four set, one request to `r.promptfoo.app` still went out: the opt-out records a "telemetry disabled" event (user id, OS, Node version; no prompts or outputs). The code in `telemetry.js` has no guard on that send.

## Decision

Adopt promptfoo as the eval runner, exact-pinned, installed `--ignore-scripts`, and only through a `gate` wrapper that sets the four variables above and runs promptfoo with `HTTPS_PROXY`/`HTTP_PROXY` pointing at a closed local port (the residual ping then cannot leave the machine). The exec wrapper scripts must unset the proxy variables before calling the agent CLI (tested: agents still work). Task 6 should keep promptfoo in an isolated package folder so its dependency tree stays out of the site's lockfile. If the owner rejects the telemetry workaround, fall back to the thin runner in `gate` (rubric prompt in, `{score, passes, issues}` JSON out).

## Evidence

- https://github.com/promptfoo/promptfoo, npm tarball `promptfoo@0.126.0` (`telemetry-*.js`, `main.js` update check)
- Config docs for exec providers: https://www.promptfoo.dev/docs/providers/custom-script/

## Privacy-audit verdict

Needs your decision. Telemetry is on by default; the opt-out leaves a single content-free ping; the package bundles dozens of AI provider clients (inactive unless configured). Report: [audits/promptfoo.md](audits/promptfoo.md). Follow-up: a sandbox run would confirm no other outbound traffic during a full eval.
