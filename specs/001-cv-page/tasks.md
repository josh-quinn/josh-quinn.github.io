---

description: "Task list for the CV pages feature"
---

# Tasks: CV pages

**Input**: Design documents from `specs/001-cv-page/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Mandatory. Constitution I makes acceptance tests mandatory, written first from the spec by the `test-author` role and committed failing with the trailer `Gate-Test-Author: <gate-task-id>`. The implementer writes inner unit tests first and watches each fail before writing the code (red, green, refactor), per the spec-kit-tdd extension (ADR 0002). Every behavior id in brackets (`[A1]`, `[U9]`) is a row in [tdd/test-list.md](tdd/test-list.md). `/speckit-tdd-run` ticks a task only when it can read those ids from it.

**Organization**: Tasks are grouped by phase. Each phase maps to exactly one gate task (one branch, one PR, one gate verdict); see [gate-tasks.md](gate-tasks.md). Story labels map to the user stories in spec.md: US1 view pages, US2 overview, US3 trust (privacy, no script, overflow, axe, 404, visual).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3
- **(CVn)**: the gate task the task belongs to
- **[An] / [Un]**: the test-list behaviors the task covers

## Path Conventions

Single static Astro project: `src/` and `tests/` at the repository root (plan §Project Structure).

## Ground rules for every gate task

- Branch `task/<id>-<slug>` from the latest `main`. The test-author task is the **first commit** on the branch and touches only `tests/acceptance/<id>/`, as the gate's `integrity` check requires.
- The implementer never creates, edits or deletes anything under `tests/acceptance/**` or `.gate/**` (constitution II).
- Colour, font and spacing only from tokens. No gradients outside `paper.css`. No shadows. No `<script>`, no `client:*` directive, no `on*` attribute (constitution IV, DESIGN.md).
- No content-file value is written into any `src/` file other than `src/content/**` (AC-24).
- The task is done when `npm run gate -- task <id>` passes, `.gate/<id>/` is committed, and the owner merges the PR.

---

## Phase 1: Setup (CV1)

**Purpose**: The types the whole feature shares.

- [ ] T001 (CV1) Create `src/lib/cv.ts` with the TypeScript types only: `Resume`, `Basics`, `Profile`, and one entry type per section (`WorkEntry`, `ProjectEntry`, `EducationEntry`, `CertificateEntry`, `AwardEntry`, `VolunteerEntry`, `InterestEntry`, `SkillEntry`), using the schema's field names exactly as in `data-model.md`. `views` is "required" on every entry type except `SkillEntry`, where it is "optional". Then create the empty folder `tests/unit/cv/` for inner tests.

---

## Phase 2: Foundational: view-selection module (CV1) ⚠️ blocks every page

**Purpose**: The pure selection rules every page depends on (FR-014, spec §View-Selection Contract, `contracts/view-selection.md`).

**Independent Test**: `npx playwright test tests/acceptance/CV1/` and `npm run test:unit`, with no page built.

### Acceptance tests (test author, first commit) ⚠️ must be observed failing

- [ ] T002 (CV1) [A1][A2][A3][A4][A5][A6][A7][A8][A9][A10] `test-author`: write failing acceptance tests for AC-01 to AC-10 in `tests/acceptance/CV1/view-selection.spec.ts` (Playwright runner, no `page`, module loaded with dynamic `import()` per test, fixtures built at runtime). Run them, confirm each fails because `src/lib/cv.ts` lacks the export, and commit with the trailer `Gate-Test-Author: CV1`.

### Implementation (implementer, inner TDD: each test task observed red before its implementation task)

- [ ] T003 (CV1) [U1][U2][U3][U4][U5][U6][U7] Write failing unit tests for `VIEWS`, `VIEW_TITLES`, `SECTION_ORDER`, `SECTION_HEADINGS`, `isView` (exact, case-sensitive) and `viewPath` in `tests/unit/cv/constants.test.ts`
- [ ] T004 (CV1) [U1][U2][U3][U4][U5][U6][U7] Implement `VIEWS = ['engineering','ocean','life']`, `VIEW_TITLES`, `SECTION_ORDER = ['work','projects','education','certificates','awards','volunteer','interests','skills']`, `SECTION_HEADINGS` (heading texts from the spec's Sections table, `volunteer` → `Volunteering`), `isView` and `viewPath(view) → '/cv/<view>/'` in `src/lib/cv.ts`
- [ ] T005 (CV1) [U8] Write failing unit tests for `entryTitle` covering the primary field of all eight sections in `tests/unit/cv/entry-title.test.ts`
- [ ] T006 (CV1) [U8] Implement `entryTitle(section, entry)` in `src/lib/cv.ts`, with primary fields `work.name`, `projects.name`, `education.institution`, `certificates.name`, `awards.title`, `volunteer.organization`, `interests.name`, `skills.name`
- [ ] T007 (CV1) [U9][U10][U11][U12][U13][U14][U15][U16][U17][U18][U19][U20][U21][U22] Write failing unit tests for `sectionsForView` in `tests/unit/cv/sections-for-view.test.ts`: tagged entries only; section order, then source order; a section with zero tagged entries omitted and one with exactly one kept; missing keys treated as `[]`; multi-view entries once per view; skills without `views` in no view; `Error` naming the value for a non-view; input not mutated
- [ ] T008 (CV1) [U9][U10][U11][U12][U13][U14][U15][U16][U17][U18][U19][U20][U21][U22] Implement `sectionsForView(resume, view)` in `src/lib/cv.ts` per `contracts/view-selection.md` guarantees 1 to 6
- [ ] T009 (CV1) [U23][U24][U25] Write failing unit tests for `overviewSections` (every skill in order, with or without `views`; `[]` for missing or empty `skills`; one item for a single skill; never another key) in `tests/unit/cv/overview-sections.test.ts`
- [ ] T010 (CV1) [U23][U24][U25] Implement `overviewSections(resume)` in `src/lib/cv.ts`
- [ ] T011 (CV1) [U26][U27][U28] Write failing unit tests for `allowedProfiles` (keeps `GitHub` and `LinkedIn`, case-insensitive, in source order, drops every other network) in `tests/unit/cv/allowed-profiles.test.ts`
- [ ] T012 (CV1) [U26][U27][U28] Implement `allowedProfiles(basics)` in `src/lib/cv.ts`
- [ ] T042 (CV1) [A1][A2][A3][A4][A5][A6][A7][A8][A9][A10] Outer loop green: `npx playwright test tests/acceptance/CV1/` passes with no change to that folder since the test-author commit
- [ ] T013 (CV1) Run `npm run gate -- task CV1` until it passes, commit `.gate/CV1/`, push and open the PR for the owner

**Checkpoint**: The selection rules are proven in isolation. Pages can now be built.

---

## Phase 3: User Story 1: read a focused view (Priority: P1) 🎯 MVP (CV2)

**Goal**: `/cv/engineering/`, `/cv/ocean/` and `/cv/life/` list exactly their tagged entries. Unknown views get the site 404. All of US3's cross-cutting guarantees hold for these routes.

**Independent Test**: `npm run build && npx playwright test tests/acceptance/CV2/`

### Acceptance tests (test author, first commit) ⚠️ must be observed failing

- [ ] T014 [US1] (CV2) [A11][A12][A13][A14][A15][A16][A18][A19][A20][A25][A26][A27][A28][A29][A30][A31][A32][A33] `test-author`: write failing acceptance tests for AC-11 to AC-16, AC-18 to AC-20, and AC-30 to AC-38 with route set R = `/cv/engineering/`, `/cv/ocean/`, `/cv/life/`, `/cv/foo/`, in `tests/acceptance/CV2/` (for example `view-pages.spec.ts`, `not-found.spec.ts`, `quality.spec.ts`). Expectations are computed from `src/content/resume.json` at test time. Confirm they fail (routes 404, or no `404.html`) and commit with `Gate-Test-Author: CV2`.

### Implementation

- [ ] T038 [US1] (CV2) [U29][U30][U31][U32] Write failing unit tests for `entryDetails(section, entry)` in `tests/unit/cv/entry-details.test.ts`: present shown fields other than the title, in the order of the spec's Shown fields table; absent fields left out; never `startDate`, `endDate`, `date`, `work.location` or `education.score`; `highlights` and `keywords` as separate items
- [ ] T039 [US1] (CV2) [U29][U30][U31][U32] Implement `entryDetails(section, entry): { lines: string[]; items: string[] }` in `src/lib/cv.ts` per `contracts/view-selection.md`
- [ ] T040 [US1] (CV2) [U33][U34] Write failing unit tests for `showPlaceholder(resume)` in `tests/unit/cv/placeholder.test.ts`: true only for `meta.placeholder === true`; false for absent `meta`, `false`, absent `placeholder`, and the string `"true"`
- [ ] T041 [US1] (CV2) [U33][U34] Implement `showPlaceholder(resume)` in `src/lib/cv.ts`
- [ ] T015 [P] [US1] (CV2) [A27][A29][A33] Create or extend `src/styles/cv.css` with CV-specific rules (header, nav, sections, entries, profile links, empty state), tokens only, reusing `.label`, `.meta`, `.island*`, `.facts`, `.reveal`/`.d1`–`.d6` from `src/styles/base.css`. Use `overflow-wrap: anywhere` on entry text and links, and `min-width: 0` on flex and grid children (research R7, R8). Keep the design phase's rules if it delivered this file.
- [ ] T016 [P] [US1] (CV2) [A31] Create `src/components/cv/PlaceholderNotice.astro`: renders `<p class="label" data-cv-placeholder>Sample content</p>` only when its `show` prop is true
- [ ] T017 [P] [US1] (CV2) [A16] Create `src/components/cv/ViewNav.astro`: `nav[aria-label="CV views"]` with one link per `VIEWS` item (text `VIEW_TITLES[v]`, `href` `viewPath(v)`), and `aria-current="page"` only on the optional `current` view
- [ ] T018 [P] [US1] (CV2) [A30] Create `src/components/cv/ProfileLinks.astro`: one `a` per `allowedProfiles(basics)` item, `href` = `url`, text = `network`. No email or phone ever.
- [ ] T019 [P] [US1] (CV2) [A12][A14] Create `src/components/cv/CvEntry.astro`: an element with `data-cv-entry`, exactly one `h3` with `entryTitle(key, entry)`, then `entryDetails(key, entry)`, with each line as text and each item as its own `li` (depends on T039)
- [ ] T020 [US1] (CV2) [A12][A13] Create `src/components/cv/CvSection.astro`: `section[data-cv-section=<key>]` with an `h2` of `SECTION_HEADINGS[key]` and one `CvEntry` per entry (depends on T019)
- [ ] T021 [US1] (CV2) [A31][A32] Create `src/layouts/Cv.astro`: wraps `src/layouts/Base.astro` (`lang="en"`, `title`, `description`), imports `src/styles/cv.css`, and renders `PlaceholderNotice` (shown when `showPlaceholder(resume)`) before the page's `h1` slot (depends on T015, T016, T041)
- [ ] T022 [US1] (CV2) [A11][A12][A15][A16][A20] Create `src/pages/cv/[view].astro`: `getStaticPaths()` over `VIEWS`; title `<View title> CV · <basics.name>`; header showing `basics.name` and `basics.label` (not summary or location); `h1` = view title; `ViewNav` with `current`; one `CvSection` per `sectionsForView(resume, view)` item; `<p data-cv-empty>Nothing listed for this view yet.</p>` when that list is empty; `ProfileLinks` (at most two `.island` on the page). Depends on T017, T018, T020, T021.
- [ ] T023 [P] [US1] (CV2) [A18][A19][A32] Create `src/pages/404.astro` on `Base.astro`: title `Page not found`, a meta description, a mono label, `h1` `Page not found`, a short line with a link to `/`. No placeholder notice, no profile links, no off-site links, no script.
- [ ] T024 [US1] (CV2) [A25][A26][A28][U35] Run `npm run build`, `npm run lint:css`, `npm run test:a11y`, `npx playwright test tests/privacy/` and `lychee --offline --no-progress --root-dir "$PWD/dist" dist`. Fix until clean. Confirm `/` and `/_fonts/` still match their baselines (`npm run test:visual`).
- [ ] T043 [US1] (CV2) [A11][A12][A13][A14][A15][A16][A18][A19][A20][A25][A26][A27][A28][A29][A30][A31][A32][A33] Outer loop green: `npm run build && npx playwright test tests/acceptance/CV2/` passes with no change to that folder since the test-author commit
- [ ] T025 [US1] (CV2) Run `npm run gate -- task CV2` until it passes, commit `.gate/CV2/`, push and open the PR

**Checkpoint**: The three views and the 404 page work and meet every cross-cutting criterion. The MVP can ship.

---

## Phase 4: User Story 2: the overview (Priority: P2) (CV3)

**Goal**: `/cv/` shows the basics, the allowed profile links, every skill and the three view links. Every view links back to it.

**Independent Test**: `npm run build && npx playwright test tests/acceptance/CV3/`

### Acceptance tests (test author, first commit) ⚠️ must be observed failing

- [ ] T026 [US2] (CV3) [A17][A21][A22][A23][A24][A34][A35][A36][A37][A38][A39][A40][A41][A42] `test-author`: write failing acceptance tests for AC-17, AC-21 to AC-24, and AC-30 to AC-38 with route set R = `/cv/`, in `tests/acceptance/CV3/` (for example `overview.spec.ts`, `back-links.spec.ts`, `no-hard-coded-content.spec.ts`, `quality.spec.ts`). Confirm they fail and commit with `Gate-Test-Author: CV3`.

### Implementation

- [ ] T027 [US2] (CV3) [A21][A22][A23][A34][A35][A36][A37][A38][A39][A40][A41][A42] Create (or replace the design prototype with) `src/pages/cv/index.astro` on `src/layouts/Cv.astro`: title `CV · <basics.name>`; `h1` `basics.name`; `basics.label`; `basics.summary`; an island with location `basics.location.region` and `ProfileLinks`; `ViewNav` with no `current`; one `CvSection` for `overviewSections(resume)`. Follow `contracts/pages.md` and the approved design-phase look.
- [ ] T028 [US2] (CV3) [A17] Add a link with text `CV overview` and `href="/cv/"` to the view header in `src/pages/cv/[view].astro` (AC-17)
- [ ] T029 [US2] (CV3) [A24] Remove any hard-coded content left by the design prototype anywhere under `src/` (outside `src/content/**`, `src/pages/index.astro` and `src/pages/_fonts.astro`) so that AC-24 holds
- [ ] T030 [US2] (CV3) [A44][U35] Add `{ id: 'cv', path: '/cv/' }` to `PAGES` in `tests/visual/pages.spec.ts` and run `npm run test:visual` against the design-phase baselines `cv-390.png` and `cv-1280.png`. Adjust `src/styles/cv.css` or the markup until `/cv/` matches. Do not update those baselines without the owner's approval.
- [ ] T044 [US2] (CV3) [A17][A21][A22][A23][A24][A34][A35][A36][A37][A38][A39][A40][A41][A42] Outer loop green: `npm run build && npx playwright test tests/acceptance/CV3/` passes, and `npx playwright test tests/acceptance/CV2/` still passes
- [ ] T031 [US2] (CV3) Run `npm run gate -- task CV3` until it passes, commit `.gate/CV3/`, push and open the PR

**Checkpoint**: All four CV routes are live and linked to each other. Every page meets the cross-cutting criteria.

---

## Phase 5: User Story 3: visual baselines (Priority: P3) (CV4)

**Goal**: Every CV page and the 404 page are held to owner-approved images at 390px and 1280px (FR-013, AC-50, AC-51).

**Independent Test**: `npx playwright test tests/acceptance/CV4/` (files) and `npm run test:visual` (pixels, in Docker)

### Acceptance tests (test author, first commit) ⚠️ must be observed failing

- [ ] T032 [US3] (CV4) [A43] `test-author`: write failing acceptance tests for AC-50 in `tests/acceptance/CV4/baselines.spec.ts` (each of `cv`, `cv-engineering`, `cv-ocean`, `cv-life`, `404` at 390 and 1280 exists under `tests/visual/__screenshots__/` and its PNG header width is 390 or 1280). Confirm the view and 404 files are missing, and commit with `Gate-Test-Author: CV4`.

### Implementation

- [ ] T033 [US3] (CV4) [A43][A44] Add `{ id: 'cv-engineering', path: '/cv/engineering/' }`, `{ id: 'cv-ocean', path: '/cv/ocean/' }`, `{ id: 'cv-life', path: '/cv/life/' }` and `{ id: '404', path: '/cv/foo/' }` to `PAGES` in `tests/visual/pages.spec.ts`
- [ ] T034 [US3] (CV4) [A43][A44][U35] Generate the new baselines in the Linux image with `npm run test:visual -- --update-snapshots`. Commit only the eight new `tests/visual/__screenshots__/{cv-engineering,cv-ocean,cv-life,404}-{390,1280}.png` files, and confirm with `git diff --stat` that the `index-*`, `fonts-*`, `cv-390.png` and `cv-1280.png` baselines are unchanged.
- [ ] T035 [US3] (CV4) [A44] **[Josh]** The owner reviews the eight new images in the PR against DESIGN.md (grid paper, islands, mono labels, italic headings, nothing overflowing at 390px) and approves them, or asks for changes in `src/styles/cv.css` followed by a regeneration (T034)
- [ ] T045 [US3] (CV4) [A43][A44] Outer loop green: `npx playwright test tests/acceptance/CV4/` passes, and `npm run test:visual` passes in the Linux image
- [ ] T036 [US3] (CV4) [A44] Run `npm run test:visual` (AC-51) and `npm run gate -- task CV4` until both pass, commit `.gate/CV4/`, push and open the PR

**Checkpoint**: The visual regression suite covers every CV page and the 404 page.

---

## Phase 6: Polish & cross-cutting (CV4)

- [ ] T037 (CV4) Walk through [quickstart.md](quickstart.md) end to end and note the results in the CV4 PR description. The manual checks are the evidence for two success criteria with no automated test: SC-005 (full content with JavaScript disabled) and SC-007 (changing an entry's `views` in a scratch copy of the content file and rebuilding moves it between views). Also check reduced motion and the 390px width by eye.

---

## Dependencies & Execution Order

### Phase dependencies

- **Design-first phase** (outside this task list): approved `/cv/` look plus `cv-390.png` and `cv-1280.png` before CV3 (T030). CV2 can use its CSS if it has landed. See plan §Dependencies.
- **Phase 1 → Phase 2 (CV1)**: types, then the module. One PR.
- **Phase 3 (CV2)** depends on CV1 being merged.
- **Phase 4 (CV3)** depends on CV2 being merged (view links, AC-22; shared components).
- **Phase 5 and Phase 6 (CV4)** depend on CV3 being merged.
- Strictly sequential gate tasks: CV1 → CV2 → CV3 → CV4. Each branches from `main` after the previous merge.

### Within a gate task

- The test-author task (T002, T014, T026, T032) is always first and is its own commit.
- Inner unit test before implementation: T003→T004, T005→T006, T007→T008, T009→T010, T011→T012, T038→T039, T040→T041.
- Components before the pages that use them: T016–T019 → T020 → T021 → T022.
- The outer-loop-green task (T042, T043, T044, T045) comes just before its gate run, and the gate run is always last.
- Task ids are stable, not positional: T038–T045 were added by `/speckit-tdd-plan` and sit where they run.

### Parallel opportunities

- CV1: the test pairs are sequential in one file (`src/lib/cv.ts`). T003, T005, T007, T009 and T011 touch different test files, but each is written just before its implementation.
- CV2: after T038–T041 (in `src/lib/cv.ts`), T015, T016, T017, T018, T019 and T023 are different files with no dependency on each other.

```text
# CV2, after T014 is committed and T038–T041 are done:
T015 src/styles/cv.css   T016 PlaceholderNotice.astro   T017 ViewNav.astro
T018 ProfileLinks.astro  T019 CvEntry.astro             T023 src/pages/404.astro
# then T020 → T021 → T022 → T024 → T043 → T025
```

## Implementation Strategy

- **MVP**: CV1 and CV2. The three focused views and the 404 page, fully hardened.
- **Increment 2**: CV3, the overview that ties them together and is held to the design-phase baselines.
- **Increment 3**: CV4, baselines for the rest, owner-approved.
- Every increment is a merged, gate-passing PR. Nothing is auto-merged.
