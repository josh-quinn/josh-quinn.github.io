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

## Discrimination check (fix round 1, run 2026-11-24)

The first critic table proved little: two easy cases, and the placeholder home page scored like the reference. Three changes followed:

- **More cases.** Three near misses were added: the real built home page with one planted defect each (`evals/design-critic/cases/near-miss-*.css`, injected before the screenshot). There is also a control, `home`: the same page with nothing injected.
- **A stricter rubric.** At the time, the critic's shadow scoring was: a single faint shadow costs 10 points, and heavy or repeated shadows are a never-list item. (Changed in 8b fix round 1: see "Shadow rule fix" below.) Gradients are judged as decorative (never) or structural (the paper grid and vignette, allowed).
- **Repeats.** The picked pair ran every case 3 times (`npm run eval:critic -- --pairs claude:sonnet --repeat 3`). This was after the redesign (technical paper, islands, motion, smaller body text).

| Case | Expected | Result (3 runs) | Score spread |
|---|---|---|---|
| `home` (control) | pass | pass ×3 | 93-93 |
| `reference` | pass | pass ×3 | 84-86 |
| `generic-page` | fail | fail ×3 | 2-2 |
| `near-miss-sans-white` (sans-serif body, white page) | fail | fail ×3 | 55-55 |
| `near-miss-indigo` (indigo/purple links and accents) | fail | fail ×3 | 55-55 |
| `near-miss-hero-cards` (64px headline, shadowed card grid) | fail | fail ×3 | 52-55 |

- **Accuracy 18/18.** Tokens: 476,316 in and 11,700 out; 172 s of summed latency.
- **One page, one defect.** Each defect alone takes the same page from 93 down to 52-55.
- **Stable spread:** at most 3 points within a case.
- **Threshold confirmed at 80.** Every pass scored at least 84 and every fail at most 55, so any threshold from 56 to 84 classifies the data. 80 is kept because it matches the role prompt (`agents/src/design-critic.md`). The thinnest margin is the reference, 4 points above it; it loses 10 points for its one soft shadow under the stricter rule.
- **Transient errors.** An earlier attempt at this run had 8 transient errors: the claude CLI exited with no tokens used, while the same call succeeded minutes later. `tools/gate/ai-agent.ts` now reports the CLI's own error text.
- **Scope.** Only the picked pair was re-run; the other pairs' rows above predate the near misses.

## Re-run after the pi.dev components (2026-11-24)

The home page changed: it gained an announcement bar, a mono nav bar, a bracket link and a split with a sticky terminal island. `DESIGN.md` gained a "Components" section. The near misses inject their defect into the built home page, so the picked pair ran every case 3 times again (`npm run eval:critic -- --pairs claude:sonnet --repeat 3`). The `reference` case was then run 3 more times on its own (`ai-eval.ts case design-critic reference`).

| Case | Expected | Result | Score spread |
|---|---|---|---|
| `home` (control, new home page) | pass | pass ×3 | 91-92 |
| `reference` | pass | pass ×3, fail ×3 (6 runs) | 58-84 |
| `generic-page` | fail | fail ×3 | 2-3 |
| `near-miss-sans-white` | fail | fail ×3 | 58-62 |
| `near-miss-indigo` | fail | fail ×3 | 55-55 |
| `near-miss-hero-cards` | fail | fail ×3 | 52-55 |

- **The 3-repeat run scored 17/18.** Tokens: 453,141 in and 11,614 out; 149 s of summed latency.
- **The site's own pages:** 80 still separates them cleanly. The control scored 91-92 and every planted defect at most 62, a margin of 29 points. The near-miss and generic scores barely moved.
- **The reference no longer passes reliably.** It used to score 84-86; across 6 runs it now scores 58, 70, 74, 82, 82 and 84.
  - Every run deducts for the soft shadow on its install panel.
  - Most runs now also see a lifted, shaded nav bar. `DESIGN.md` now describes the nav bar exactly: a flat row over a hairline.
  - With two shadowed panels, the rubric's never-list wording ("shadows on several panels") applies. Three runs applied it, which caps the score at 60 or deducts enough to fail.
  - Those fails followed the rubric's wording at the time, which counted panels rather than judging how heavy the shadows were.
- **Threshold:** kept at 80. It still separates every page built for this site from every planted defect. It no longer places the reference on the pass side.
- **Resolved** by the controller in 8b fix round 1: see "Shadow rule fix" below. The reference stays a required pass; only the critic's scoring of shadows changed.

## Shadow rule fix (8b fix round 1, run 2026-11-24)

The site's own rule is unchanged: this site's pages use no drop shadows (`DESIGN.md` "Shadow"). Only the critic's scoring changed, in `evals/design-critic/rubric.md`, and the reference stays a required pass. `DESIGN.md` now states the shadow rule as the site's own, and leaves scoring to the rubric. Its nav bar text describes this site's bar without comparing it with the reference.

**Rubric changes:**

- **Shadows are judged by how they look, not by how many panels carry one.** Heavy, dark or hard-edged shadows, or a grid of shadowed cards, stay never-list items. Faint, soft panel shadows are a deduction only, never a never-list item.
- **Scope.** A logo's or brand mark's own colours are branding, so out of scope. Text or panels caught faded part-way through an entrance are scroll-animation artefacts, and cost nothing.

**Size of the soft-shadow deduction (measured, claude/sonnet):**

| Soft-shadow rule | `reference` scores | Reference passes |
|---|---|---|
| 10 per panel, at most 20 (as first ruled) | 3 repeats: 72, 78, 80; 6 more: 80, 78, 75, 78, 76, 78 | 2/9 |
| **10 in total, however many panels (adopted)** | 6 runs: 88, 89, 88, 89, 88, 88; 3 repeats: 88-89 | **9/9** |

- The reference has soft shadows on two panels, its install box and its nav bar.
- **At 20 points:** it starts at 80 before any other judgement. A 2-point note on its lighter-blue accent word then fails it, so the pass margin is zero.
- **At 10 in total:** it scores 88-89. That is about the 84-86 it scored before the components were added, when the critic saw only one shadowed panel.

**Full calibration with the adopted rule** (`npm run eval:critic -- --pairs claude:sonnet --repeat 3`):

| Case | Expected | Result (3 runs) | Score spread |
|---|---|---|---|
| `home` (control) | pass | pass ×3 | 92-93 |
| `reference` | pass | pass ×3 (and 6/6 in the separate run) | 88-89 |
| `generic-page` | fail | fail ×3 | 2-3 |
| `near-miss-sans-white` | fail | fail ×3 | 55-58 |
| `near-miss-indigo` | fail | fail ×3 | 55-55 |
| `near-miss-hero-cards` | fail | fail ×3 | 55-55 |

- **Accuracy 18/18**, with 0 unstable groups and 0 errors. Tokens: 500,337 in and 11,570 out; 150 s of summed latency.
- **Threshold 80 separates every case.** Every pass scored at least 88, and every fail at most 58. The thinnest margin is now 8 points (the reference).
- **The defects still fail at full strength.** A shadowed card grid is still a never-list item (`near-miss-hero-cards`, 55).

## Decision

| Eval | Backend | Model | Why |
|---|---|---|---|
| `design-critic` | claude | sonnet | One of four pairs with 2/2, and the fastest (14 s vs 23 to 79 s). Clear margins: generic 2, reference 92. |
| `auditor` | claude | sonnet | One of four pairs with 4/4 in the final run, the fastest (23 s), and the fewest tokens. Margins: defects 10 to 40, clean 88. |

Both picks are written to `~/.config/jq-tools/gate/config.yaml` as `ai.design-critic` and `ai.auditor` (hand-edited; the existing keys kept). `gate` records the backend and model per check in the verdict.

## Consequences

- For the picked critic the spread is now measured (3 runs, at most 3 points). The auditor rows are still one run per case: the clean patch (88) clears 80 by a modest margin. If a check flips between runs, re-run with `--repeat 3` before changing a rubric.
- `claude:haiku` is not suitable for the critic: it treats the reference's own look (one soft shadow, a centred headline) as never-list items. `copilot:default` is accurate on the critic, but one stalled call makes it a poor default for a gate.
- Re-run `npm run eval:calibrate` whenever a rubric, a role prompt, `DESIGN.md` or a model changes, and update this record and the config.
- The site never needs this on CI: AI checks are local only.

## Privacy-audit verdict

Not applicable: no new tool is adopted here. promptfoo is covered by 0003 (with its Task 6 addendum); the agent CLIs are the services the toolkit calls.
