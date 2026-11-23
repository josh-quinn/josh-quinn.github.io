# 0006. AI eval models: which backend and model each eval uses

Status: accepted (2026-11-23). The pick was delegated by the owner to the implementer, against the criteria below; it is reversible by re-running calibration.

## Context

`gate` runs two AI checks: `design-critic` (screenshots against `DESIGN.md`, beside the reference) and `auditor` (the branch diff against the constitution). Each can run on `claude -p`, `copilot -p` or `agy -p` (all headless per 0004, all accept image paths per 0003). Which backend and model each uses is a machine setting: `ai.design-critic` and `ai.auditor` in `~/.config/jq-tools/gate/config.yaml`.

## Method

`npm run eval:calibrate` (`evals/run.ts`, promptfoo 0.126.0 with the lock-down in 0003) ran every calibration case once per pair, through the same code path as the gate checks (`tools/gate/ai-eval.ts`):

- **design-critic:** `generic-page` (Tailwind-default page: gradient hero, giant centred headline, shadowed card grid, emoji) must fail; `reference` (the reference screenshots themselves, from the uncommitted `.cache/reference/`) must pass. Pass threshold 80 (`evals/design-critic/rubric.md`).
- **auditor:** three patches with planted defects (an implementer edit to `tests/acceptance/`, a hard-coded colour, a `mailto:` link with a runtime-assembled fake email) must fail; one clean patch must pass. Pass threshold 80 (`evals/auditor/rubric.md`).

Pairs: `claude:haiku`, `claude:sonnet`, `copilot:default` (the plan offers only Copilot's auto model, which chose `gpt-5.6-luna`; every named model probed, including `claude-haiku-4.5`, `claude-haiku-5.5`, `claude-sonnet-5.5`, `gpt-6-luna` and `gemini-3.8-flash`, was "not available"), `agy:default` and `agy:gemini-3.8-flash-medium`. One run per case per pair. Concurrency 3.

Pick rule: accuracy first (every case classified correctly), then wall time, then tokens. Tokens are the CLI's own counts (input includes cached input; see 0003). Wall time is the sum of per-case latencies.

## Results (run, 2026-11-23)

Final runs, after the last rubric and `DESIGN.md` changes:

| Pair | Eval | Accuracy | Errors | Tokens in | Tokens out | Wall time (s) | Cases (score) |
|---|---|---|---|---|---|---|---|
| claude:sonnet | design-critic | **2/2** | 0 | 51,118 | 1,497 | **14** | generic fail 2; reference pass 92 |
| agy:default | design-critic | 2/2 | 0 | 37,084 | 3,976 | 23 | generic fail 0; reference pass 100 |
| copilot:default | design-critic | 2/2 | 0 | 40,890 | 1,172 | 30 | generic fail 25; reference pass 98 |
| agy:gemini-3.8-flash-medium | design-critic | 2/2 | 0 | 56,991 | 10,056 | 79 | generic fail 0; reference pass 98 |
| claude:haiku | design-critic | 1/2 | 0 | 53,567 | 3,212 | 21 | generic fail 5; **reference fail 58** |
| claude:sonnet | auditor | **4/4** | 0 | 41,402 | 1,695 | **23** | acceptance-edit fail 10; colour fail 40; mailto fail 20; clean pass 88 |
| claude:haiku | auditor | 4/4 | 0 | 63,441 | 6,233 | 35 | acceptance-edit fail 20; colour fail 35; mailto fail 30; clean pass 80 |
| agy:default | auditor | 4/4 | 0 | 64,714 | 10,662 | 58 | acceptance-edit fail 25; colour fail 40; mailto fail 40; clean pass 100 |
| agy:gemini-3.8-flash-medium | auditor | 4/4 | 0 | 110,805 | 27,912 | 186 | acceptance-edit fail 30; colour fail 50; mailto fail 40; clean pass 100 |
| copilot:default | auditor | 3/4 | 1 | 518,597 | 4,745 | 710 | acceptance-edit fail 50; colour fail 50; mailto fail 50; **clean: error** (model call stalled, killed at the 10-minute agent timeout) |

Earlier runs, for the record:

- The first full calibration (same pairs) gave the same critic picture: `claude:haiku` failed the reference (58); everyone else was 2/2, and `claude:sonnet` was fastest (14 s).
- On the auditor, `claude:haiku` failed the clean patch (55). `claude:sonnet` passed it only narrowly (82). Both deducted for context a standalone patch cannot show: no `spec.md`, and no visible test-author commit. The auditor rubric now says to judge what the change shows and not to deduct for missing context. The auditor suite was then re-run for every pair (the table above).
- Copilot completed all four auditor cases in the first run (4/4, 117 s, 443k input tokens).
- Copilot's input counts are high because its agent reads many repository files on its own.

## Decision

| Eval | Backend | Model | Why |
|---|---|---|---|
| `design-critic` | claude | sonnet | One of four pairs with 2/2, and the fastest (14 s vs 23 to 79 s). Clear margins: generic 2, reference 92. |
| `auditor` | claude | sonnet | One of four pairs with 4/4 in the final run, the fastest (23 s), and the fewest tokens. Margins: defects 10 to 40, clean 88. |

Both picks are written to `~/.config/jq-tools/gate/config.yaml` as `ai.design-critic` and `ai.auditor` (hand-edited; the existing keys kept). `gate` records the backend and model per check in the verdict.

## Consequences

- With one run per case, these numbers show that a pair works, not how much its results vary. The clean auditor patch (88) and the reference (92) clear the threshold of 80 by a modest margin. If a check flips between runs, re-run calibration with repeats before changing the rubric.
- `claude:haiku` is not suitable for the critic: it treats the reference's own look (one soft shadow, a centred headline) as never-list items. `copilot:default` is accurate on the critic, but one stalled call makes it a poor default for a gate.
- Re-run `npm run eval:calibrate` whenever a rubric, a role prompt, `DESIGN.md` or a model changes, and update this record and the config.
- The site never needs this on CI: AI checks are local only.

## Privacy-audit verdict

Not applicable: no new tool is adopted here. promptfoo is covered by 0003 (with its Task 6 addendum); the agent CLIs are the services the toolkit calls.
