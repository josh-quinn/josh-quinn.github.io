# AI evals

The design critic and the auditor, and the calibration cases that decide which backend and model each uses. Decisions: `docs/decisions/0003-ai-eval-runner.md` (promptfoo, telemetry lock-down) and `docs/decisions/0006-ai-eval-models.md` (the calibrated picks).

> **Not cleared for the work laptop.** promptfoo is a personal-machine tool only (ADR 0003). On the work laptop, do not install this folder; the planned route there is a thin runner inside `gate` with no third-party dependency.

## Layout

| Path | What |
|---|---|
| `package.json`, `package-lock.json` | promptfoo, exact-pinned (0.126.0), isolated from the site's dependencies |
| `provider.mjs` | promptfoo provider: runs one case through `tools/gate/ai-eval.ts case`, reports the agent CLI's own token counts |
| `expect-verdict.mjs` | assertion: the case was classified as expected (`vars.expected`) |
| `run.ts` | the only way to run promptfoo here: sets the lock-down, prints the calibration table |
| `design-critic/` | `rubric.md` (wording and pass threshold), `promptfooconfig.yaml`, `cases/` |
| `auditor/` | `rubric.md`, `promptfooconfig.yaml`, `cases/` (patches with planted defects, and one clean) |

The role prompts are `agents/src/design-critic.md` and `agents/src/auditor.md`. `tools/gate/ai-eval.ts` builds the full prompt (role, rubric, `DESIGN.md` or the constitution, then the screenshots or the diff), runs the agent CLI read-only (`tools/gate/ai-agent.ts`), and prints `{score, passes, issues, tokens}`. `gate` runs the same code for its `design-critic` and `auditor` checks, so calibration measures exactly what the gate runs.

## Setup

```sh
npm ci --ignore-scripts --prefix evals   # promptfoo, no install scripts
```

The agent CLIs (`claude`, `copilot`, `agy`) must be installed and logged in. No API key is used.

## Run

```sh
npm run eval:critic                       # critic cases, every pair
npm run eval:auditor                      # auditor cases, every pair
npm run eval:calibrate                    # both, then the table (also .cache/evals/calibration.md)
npm run eval:calibrate -- --pairs 'claude:'   # only pairs whose label matches the regex
```

Pairs are the `providers` in each `promptfooconfig.yaml` (keep the two lists the same). Re-run calibration whenever a rubric, a role prompt, `DESIGN.md` or a model changes, and update ADR 0006 and the `ai.design-critic` / `ai.auditor` entries in `~/.config/jq-tools/gate/config.yaml` if the pick changes.

## Lock-down

`run.ts` starts promptfoo with:

- `PROMPTFOO_DISABLE_TELEMETRY`, `_UPDATE`, `_SHARING`, `_SHARE_EMAIL_REQUEST`, `_REMOTE_GENERATION` and `_REDTEAM_REMOTE_GENERATION` set to 1;
- `PROMPTFOO_CONFIG_DIR=.cache/promptfoo` (uncommitted), `--no-write`, `--no-cache`;
- `HTTP_PROXY`/`HTTPS_PROXY` pointing at a closed local port, because promptfoo 0.126.0 still sends one "telemetry disabled" event with telemetry disabled (measured; see the ADR 0003 Task 6 addendum). `provider.mjs` and `ai-agent.ts` remove the proxy variables again for the agent CLIs, which must reach their own services. `EVALS_PROXY=<url>` points promptfoo at another proxy (for example a logging one, to re-check); `EVALS_PROXY=none` turns the dead proxy off.

## Fixtures

- No third-party screenshot is committed. The critic's `reference` case uses the screenshots in `.cache/reference/`, captured at runtime (`npm run refs`).
- No personal data is committed. The auditor's `mailto-link` case holds `{{FAKE_EMAIL}}`; `ai-eval.ts` fills in a made-up address at runtime.
