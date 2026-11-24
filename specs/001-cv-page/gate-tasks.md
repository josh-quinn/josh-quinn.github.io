# Gate tasks: CV pages

Maps each gate task to the `tasks.md` checkboxes it covers, the acceptance criteria it owns, and its acceptance-test folder. One gate task = one branch `task/<id>-<slug>` = one PR = one `npm run gate -- task <id>` verdict in `.gate/<id>/`. Ids match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` (`tools/gate/ids.ts`) and contain no `-`, so `taskIdFromBranch` reads them back from the branch name.

Run them strictly in order. Each branches from `main` after the previous PR is merged.

| Order | Gate task | Branch | Scope | tasks.md checkboxes | Owns (spec ACs) | Route set R (AC-30–AC-38) | Test-list behaviors | Acceptance tests |
|---|---|---|---|---|---|---|---|---|
| 1 | `CV1` | `task/CV1-view-selection` | View-selection module `src/lib/cv.ts` and its inner unit tests | T001, T002, T003–T012, T042, T013 | AC-01 – AC-10 | none | A1–A10, U1–U28 | `tests/acceptance/CV1/` |
| 2 | `CV2` | `task/CV2-view-pages` | CV layout and components, `/cv/engineering/`, `/cv/ocean/`, `/cv/life/`, site 404 page, `entryDetails` and `showPlaceholder` | T014, T038–T041, T015–T024, T043, T025 | AC-11 – AC-16, AC-18 – AC-20, AC-30 – AC-38 | `/cv/engineering/`, `/cv/ocean/`, `/cv/life/`, `/cv/foo/` (404) | A11–A16, A18–A20, A25–A33, U29–U34, U35 (keep green) | `tests/acceptance/CV2/` |
| 3 | `CV3` | `task/CV3-overview` | `/cv/` overview, `CV overview` back-links on the views, no hard-coded content, `/cv/` in the visual suite | T026, T027–T030, T044, T031 | AC-17, AC-21 – AC-24, AC-30 – AC-38 | `/cv/` | A17, A21–A24, A34–A42, U35 (keep green) | `tests/acceptance/CV3/` |
| 4 | `CV4` | `task/CV4-visual-baselines` | Owner-approved baselines for the views and the 404 page; every CV page in the visual suite; quickstart walk-through | T032, T033–T035, T045, T036, T037 | AC-50, AC-51 | none | A43, A44, U35 (keep green) | `tests/acceptance/CV4/` (AC-50). AC-51 is verified by the gate's `visual` check. |

Every acceptance criterion in spec.md is owned by exactly one gate task: AC-01–AC-10 (CV1), AC-11–AC-16 and AC-18–AC-20 (CV2), AC-17 and AC-21–AC-24 (CV3), AC-50–AC-51 (CV4). AC-30–AC-38 are owned by CV2 for its route set and by CV3 for `/cv/`, as spec §Delivery Slices states.

## Per gate task: what the test author gets

The test author reads only `spec.md` and the constitution. The controller's dispatch names the gate-task id, the AC ids and the route set from the table above; spec §Delivery Slices states the same, so no plan is needed.

- **CV1**: AC-01–AC-10, from spec §View-Selection Contract. Module tests in the Playwright runner, no `page`, `src/lib/cv.ts` loaded with dynamic `import()` per test. Expected red: the module or export is missing.
- **CV2**: AC-11–AC-16, AC-18–AC-20, and AC-30–AC-38 for R = the three view routes plus `/cv/foo/`. Expected red: the view routes and `/cv/foo/` serve the generic 404 (no `dist/404.html`, no `Page not found` page), and every page check fails.
- **CV3**: AC-17, AC-21–AC-24, and AC-30–AC-38 for R = `/cv/`. Expected red: `/cv/` returns 404 (or, if a design prototype is routed there, fails the structure, AC-24 and back-link checks).
- **CV4**: AC-50. Expected red: the view and 404 baseline files are missing. The `cv-390.png` and `cv-1280.png` part may already be green from the design phase; that is recorded, not a defect.

## Why this split (and not overview first)

The gate's `links` check (lychee, offline) runs on every task. An overview landing before the views would link to pages that do not exist and fail the gate. The views link only to each other and to the external profiles. The overview, and the views' back-link to it, land together in CV3. The cross-cutting checks (privacy, no script, 390px, axe, reduced motion) are owned by the page tasks for their own routes, rather than by a final hardening task. That way each test is written before its page exists and is seen to fail. A hardening-only task would find most of them already green. CV4 keeps only what genuinely comes last: owner-approved images of the finished pages. See research R9 and plan §Gate tasks.

## Agent route per gate task

Constitution V and Task 8 Step 6 require at least one CV gate task to run end to end through Copilot CLI (`/speckit-implement` plus the role agents generated into `.github/agents/`). **Recommended: `CV1`.** It is the smallest, it has no visual or browser dependency, and its acceptance tests run without a page. That keeps any Copilot gaps apart from page-rendering issues. CV2 to CV4 run through Claude Code. If CV1 cannot finish under Copilot, log the gap and run CV2 under Copilot instead.

## Checklists before implementation

- `checklists/requirements.md` is complete (16/16).
- `checklists/acceptance.md` holds 37 reviewer-owned items, all unchecked, for the owner to review. `/speckit-implement` treats unchecked checklist items as a gate and asks before going on. Either the owner reviews and marks them, or the controller answers that prompt with a pointer to this note. The binding checks are the gate verdicts, not the checklist.

## Outside the gate tasks

- **Design-first phase** (Task 8 Step 4, before CV1): approved `/cv/` look, `npm run gate -- design cv`, baselines `cv-390.png` and `cv-1280.png`. See plan §Dependencies for what should and should not land on `main` from it.
- **Retro log** (Task 8 Step 5.6): after each gate task merges, the controller appends a row to `docs/retro/slice-1-log.md`. It is not a `tasks.md` item because it records the process, not the feature.
