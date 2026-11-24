---

description: "Task list for the CV pages feature"
---

# Tasks: CV pages

**Input**: Design documents from `specs/001-cv-page/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Mandatory. Constitution I makes acceptance tests mandatory, written first from the spec by the `test-author` role and committed failing with the trailer `Gate-Test-Author: <gate-task-id>`. The implementer writes inner unit tests first and watches each fail before writing the code (red, green, refactor), per the spec-kit-tdd extension (ADR 0002). Every behavior id in brackets (`[A1]`, `[U9]`) is a row in [tdd/test-list.md](tdd/test-list.md). `/speckit-tdd-run` ticks a task only when it can read those ids from it.

**Organization**: Tasks are grouped by phase. Each phase is exactly one gate task (one branch, one PR, one gate verdict); see [gate-tasks.md](gate-tasks.md). Story labels map to the user stories in spec.md: US1 view pages, US2 overview, US3 trust (privacy, no script, overflow, axe, 404, visual). There is deliberately no separate Setup phase: nothing may come before a gate task's test-author commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3
- **(CVn)**: the gate task the task belongs to
- **[An] / [Un]**: the test-list behaviors the task covers

## Path Conventions

Single static Astro project: `src/` and `tests/` at the repository root (plan §Project Structure).

## Ground rules for every gate task

- Branch `task/<id>-<slug>` from the latest `main`. **The test-author task is the first task of every gate task, and nothing precedes it**: no setup, no scaffolding, no types. Its commit is the first commit on the branch and touches only `tests/acceptance/<id>/`. The gate's `integrity` check fails if any commit comes before it. A runner that executes tasks in order (`/speckit-implement`, including the Copilot route for CV1) therefore starts with the test-author task.
- The implementer never creates, edits or deletes anything under `tests/acceptance/**` or `.gate/**` (constitution II).
- Colour, font and spacing only from tokens. No gradients outside `paper.css`. No shadows. No `<script>`, no `client:*` directive, no `on*` attribute (constitution IV, DESIGN.md).
- No rendered value from the content file (AC-24's definition: `basics.name`, `basics.label`, `basics.summary`, profile `username` and `url`, and every shown field of every entry) that is 8 or more characters long appears verbatim in any file under `src/`. The exceptions are exactly AC-24's: `src/content/**`, `src/pages/index.astro` and `src/pages/_fonts.astro`.
- The exported signatures of `src/lib/cv.ts` are exactly those in spec.md §View-Selection Contract. Never narrow them; the acceptance tests are type-checked against them.
- The task is done when `npm run gate -- task <id>` passes, `.gate/<id>/` is committed, and the owner merges the PR.

---

## Phase 1: Foundational: view-selection module (CV1) ⚠️ blocks every page

**Purpose**: The pure selection rules every page depends on (FR-014, spec §View-Selection Contract, `contracts/view-selection.md`).

**Independent Test**: `npm run build && npx playwright test tests/acceptance/CV1/` (the Playwright config serves the built `dist/` even for module-only specs), then `npm run test:unit`.

### Acceptance tests (test author, first commit, nothing before it) ⚠️ must be observed failing

- [ ] T002 (CV1) [A1][A2][A3][A4][A5][A6][A7][A8][A9][A10] `test-author`: write failing acceptance tests for AC-01 to AC-10 in `tests/acceptance/CV1/view-selection.spec.ts`. Use the Playwright runner with no `page`, load the module with dynamic `import()` per test, build fixtures at runtime, and type them with the spec's exported types. Run them after `npm run build`, confirm each fails because `src/lib/cv.ts` or the export is missing, and commit with the trailer `Gate-Test-Author: CV1` as the first commit on the branch.

### Implementation (implementer, inner TDD: each test task observed red before its implementation task)

- [ ] T003 (CV1) [U1][U2][U3][U4][U5][U6][U7] Create the folder `tests/unit/cv/` and write failing unit tests for `VIEWS`, `VIEW_TITLES`, `SECTION_ORDER`, `SECTION_HEADINGS`, `isView` (exact, case-sensitive) and `viewPath` in `tests/unit/cv/constants.test.ts`
- [ ] T004 (CV1) [U1][U2][U3][U4][U5][U6][U7] Create `src/lib/cv.ts`. Declare the exported types exactly as in spec.md §View-Selection Contract (`View`, `SectionKey`, `Entry` with optional `views`, `Profile`, `Basics`, `Resume` with every key optional, `SectionResult`). Then implement `VIEWS = ['engineering','ocean','life']`, `VIEW_TITLES`, `SECTION_ORDER = ['work','projects','education','certificates','awards','volunteer','interests','skills']`, `SECTION_HEADINGS` (heading texts from the spec's Sections table, `volunteer` → `Volunteering`), `isView` and `viewPath(view) → '/cv/<view>/'`. (This absorbs the former setup task T001.)
- [ ] T005 (CV1) [U8][U36][U37] Write failing unit tests for `entryTitle` covering the primary field of all eight sections, `''` for an absent primary field, and an `Error` for a non-section key, in `tests/unit/cv/entry-title.test.ts`
- [ ] T006 (CV1) [U8][U36][U37] Implement `entryTitle(section: string, entry: Entry)` in `src/lib/cv.ts`, with primary fields `work.name`, `projects.name`, `education.institution`, `certificates.name`, `awards.title`, `volunteer.organization`, `interests.name`, `skills.name`
- [ ] T007 (CV1) [U9][U10][U11][U12][U13][U14][U15][U16][U17][U18][U19][U20][U21][U22][U39] Write failing unit tests for `sectionsForView` in `tests/unit/cv/sections-for-view.test.ts`. Cover: tagged entries only; section order, then source order; a section with zero tagged entries omitted and one with exactly one kept; missing keys treated as `[]`; absent or empty `views` meaning no view; multi-view entries once per view; skills without `views` in no view; an `Error` naming the value for a non-view; input not mutated.
- [ ] T008 (CV1) [U9][U10][U11][U12][U13][U14][U15][U16][U17][U18][U19][U20][U21][U22][U39] Implement `sectionsForView(resume: Resume, view: string)` in `src/lib/cv.ts` per spec §View-Selection Contract and `contracts/view-selection.md` notes 2 to 5
- [ ] T009 (CV1) [U23][U24][U25] Write failing unit tests for `overviewSections` in `tests/unit/cv/overview-sections.test.ts`. Cover: every skill in order, with or without `views`; `[]` for missing or empty `skills`; one item for a single skill; never another key.
- [ ] T010 (CV1) [U23][U24][U25] Implement `overviewSections(resume: Resume)` in `src/lib/cv.ts`
- [ ] T011 (CV1) [U26][U27][U28][U38] Write failing unit tests for `allowedProfiles` in `tests/unit/cv/allowed-profiles.test.ts`: keeps `GitHub` and `LinkedIn`, case-insensitive, in source order; drops every other network; `[]` for `undefined` basics.
- [ ] T012 (CV1) [U26][U27][U28][U38] Implement `allowedProfiles(basics: Basics | undefined)` in `src/lib/cv.ts`
- [ ] T042 (CV1) [A1][A2][A3][A4][A5][A6][A7][A8][A9][A10] Outer loop green: `npm run build && npx playwright test tests/acceptance/CV1/` passes with no change to that folder since the test-author commit, and `npm run lint` (`astro check`, which type-checks the acceptance specs) is clean
- [ ] T013 (CV1) Run `npm run gate -- task CV1` until it passes, commit `.gate/CV1/`, push and open the PR for the owner

**Checkpoint**: The selection rules are proven in isolation. Pages can now be built.

---

## Phase 2: User Story 1: read a focused view (Priority: P1) 🎯 MVP (CV2)

**Goal**: `/cv/engineering/`, `/cv/ocean/` and `/cv/life/` list exactly their tagged entries. Unknown views get the site 404. All of US3's cross-cutting guarantees hold for these routes.

**Independent Test**: `npm run build && npx playwright test tests/acceptance/CV2/`

### Acceptance tests (test author, first commit, nothing before it) ⚠️ must be observed failing

- [ ] T014 [US1] (CV2) [A11][A12][A13][A14][A15][A16][A18][A19][A20][A25][A26][A27][A28][A29][A30][A31][A32][A33][A45] `test-author`: write failing acceptance tests for AC-11 to AC-16, AC-18 to AC-20, and AC-30 to AC-39 with route set R = `/cv/engineering/`, `/cv/ocean/`, `/cv/life/`, `/cv/foo/`, in `tests/acceptance/CV2/` (for example `view-pages.spec.ts`, `not-found.spec.ts`, `quality.spec.ts`). Expectations are computed from `src/content/resume.json` at test time. Confirm they fail (the routes 404, or there is no `404.html`) and commit with `Gate-Test-Author: CV2` as the first commit on the branch.

### Implementation

- [ ] T038 [US1] (CV2) [U29][U30][U31][U32] Write failing unit tests for `entryDetails(section, entry)` in `tests/unit/cv/entry-details.test.ts`. Cover: present shown fields other than the title, in the order of the spec's Shown fields table; absent fields left out; never `startDate`, `endDate`, `date`, `work.location` or `education.score`; `highlights` and `keywords` as separate items.
- [ ] T039 [US1] (CV2) [U29][U30][U31][U32] Implement `entryDetails(section: string, entry: Entry): { lines: string[]; items: string[] }` in `src/lib/cv.ts` per spec §View-Selection Contract
- [ ] T040 [US1] (CV2) [U33][U34] Write failing unit tests for `showPlaceholder(resume)` in `tests/unit/cv/placeholder.test.ts`: true only for `meta.placeholder === true`; false for absent `meta`, `false`, absent `placeholder`, and the string `"true"`
- [ ] T041 [US1] (CV2) [U33][U34] Implement `showPlaceholder(resume: Resume)` in `src/lib/cv.ts`
- [ ] T015 [P] [US1] (CV2) [A27][A29][A33] Create or extend `src/styles/cv.css` with CV-specific rules (site header, nav, sections, entries, profile links, empty state), tokens only, reusing `.label`, `.meta`, `.island*`, `.facts`, `.reveal`/`.d1`–`.d6` from `src/styles/base.css`. Use `overflow-wrap: anywhere` on entry text and links, and `min-width: 0` on flex and grid children (research R7, R8). Keep the design phase's rules if it delivered this file.
- [ ] T016 [P] [US1] (CV2) [A31] Create `src/components/cv/PlaceholderNotice.astro`: renders `<p class="label" data-cv-placeholder>Sample content</p>` only when its `show` prop is true
- [ ] T017 [P] [US1] (CV2) [A16] Create `src/components/cv/ViewNav.astro`: `nav[aria-label="CV views"]` with one link per `VIEWS` item (text `VIEW_TITLES[v]`, `href` `viewPath(v)`), and `aria-current="page"` only on the optional `current` view
- [ ] T018 [P] [US1] (CV2) [A30] Create `src/components/cv/ProfileLinks.astro`: one `a` per `allowedProfiles(basics)` item, `href` = `url`, text = `network`. No email or phone ever.
- [ ] T019 [P] [US1] (CV2) [A12][A14] Create `src/components/cv/CvEntry.astro`: an element with `data-cv-entry`, exactly one `h3` with `entryTitle(key, entry)`, then `entryDetails(key, entry)`, with each line as text and each item as its own `li` (depends on T039)
- [ ] T020 [US1] (CV2) [A12][A13] Create `src/components/cv/CvSection.astro`: `section[data-cv-section=<key>]` with an `h2` of `SECTION_HEADINGS[key]` and one `CvEntry` per entry (depends on T019)
- [ ] T021 [US1] (CV2) [A31][A32][A45] Create `src/layouts/Cv.astro`. It wraps `src/layouts/Base.astro` (`lang="en"`, `title`, `description`) and imports `src/styles/cv.css`. It renders, in this order: a modest `header` whose only content is `<a href="/">{basics.name}</a>` (FR-015); `PlaceholderNotice` (shown when `showPlaceholder(resume)`); then the page slot that holds the `h1`. Depends on T015, T016, T041.
- [ ] T022 [US1] (CV2) [A11][A12][A15][A16][A20][A45] Create `src/pages/cv/[view].astro` on `Cv.astro`:
  - `getStaticPaths()` over `VIEWS`;
  - title `<View title> CV · <basics.name>`;
  - `basics.label` shown (the name is in the header link; no summary or location);
  - `h1` = view title, then `ViewNav` with `current`;
  - one `CvSection` per `sectionsForView(resume, view)` item;
  - `<p data-cv-empty>Nothing listed for this view yet.</p>` when that list is empty;
  - `ProfileLinks`;
  - at most two `.island` on the page.

  Depends on T017, T018, T020, T021.
- [ ] T023 [P] [US1] (CV2) [A18][A19][A32] Create `src/pages/404.astro` on `Base.astro`: title `Page not found`, a meta description, a mono label, `h1` `Page not found`, a short line with a link to `/`. No placeholder notice, no profile links, no off-site links, no script.
- [ ] T024 [US1] (CV2) [A25][A26][A28][U35] Run `npm run build`, `npm run lint`, `npm run lint:css`, `npm run test:a11y`, `npx playwright test tests/privacy/` and `lychee --offline --no-progress --root-dir "$PWD/dist" dist`. Fix until clean. Confirm `/` and `/_fonts/` still match their baselines (`npm run test:visual`).
- [ ] T043 [US1] (CV2) [A11][A12][A13][A14][A15][A16][A18][A19][A20][A25][A26][A27][A28][A29][A30][A31][A32][A33][A45] Outer loop green: `npm run build && npx playwright test tests/acceptance/CV2/` passes with no change to that folder since the test-author commit, and `npx playwright test tests/acceptance/CV1/` still passes
- [ ] T025 [US1] (CV2) Run `npm run gate -- task CV2` until it passes, commit `.gate/CV2/`, push and open the PR

**Checkpoint**: The three views and the 404 page work and meet every cross-cutting criterion. The MVP can ship.

---

## Phase 3: User Story 2: the overview (Priority: P2) (CV3)

**Goal**: `/cv/` shows the home link, the basics, the allowed profile links, every skill and the three view links. Every view links back to it.

**Independent Test**: `npm run build && npx playwright test tests/acceptance/CV3/`

### Acceptance tests (test author, first commit, nothing before it) ⚠️ must be observed failing

- [ ] T026 [US2] (CV3) [A17][A21][A22][A23][A24][A34][A35][A36][A37][A38][A39][A40][A41][A42][A46] `test-author`: write failing acceptance tests for AC-17, AC-21 to AC-24, and AC-30 to AC-39 with route set R = `/cv/`, in `tests/acceptance/CV3/` (for example `overview.spec.ts`, `back-links.spec.ts`, `no-hard-coded-content.spec.ts`, `quality.spec.ts`). Confirm the `/cv/` and back-link tests fail. The AC-24 test (A24) is expected to pass on arrival; record that, don't force a red. Commit with `Gate-Test-Author: CV3` as the first commit on the branch.

### Implementation

- [ ] T027 [US2] (CV3) [A21][A22][A23][A34][A35][A36][A37][A38][A39][A40][A41][A42][A46] Create (or replace the design prototype with) `src/pages/cv/index.astro` on `src/layouts/Cv.astro`:
  - title `CV · <basics.name>`;
  - `h1` `basics.name`, then `basics.label` and `basics.summary`;
  - an island with location `basics.location.region` and `ProfileLinks`;
  - `ViewNav` with no `current`;
  - one `CvSection` for `overviewSections(resume)`.

  Follow `contracts/pages.md` and the approved design-phase look.
- [ ] T028 [US2] (CV3) [A17] Add a link with text `CV overview` and `href="/cv/"` to `src/pages/cv/[view].astro`, outside `nav[aria-label="CV views"]` and outside the site `header` (AC-17, AC-16, AC-39)
- [ ] T029 [US2] (CV3) [A24] Remove any hard-coded content left by the design prototype anywhere under `src/` (outside AC-24's exemptions) so that AC-24 holds
- [ ] T030 [US2] (CV3) [U35] Prepare for A44, which CV4 owns: add `{ id: 'cv', path: '/cv/' }` to `PAGES` in `tests/visual/pages.spec.ts`, and run `npm run test:visual` against the design-phase baselines `cv-390.png` and `cv-1280.png`. Adjust `src/styles/cv.css` or the markup until `/cv/` matches. Do not update those baselines without the owner's approval.
- [ ] T044 [US2] (CV3) [A17][A21][A22][A23][A24][A34][A35][A36][A37][A38][A39][A40][A41][A42][A46] Outer loop green: `npm run build && npx playwright test tests/acceptance/CV3/` passes, and the CV1 and CV2 acceptance folders still pass
- [ ] T031 [US2] (CV3) Run `npm run gate -- task CV3` until it passes, commit `.gate/CV3/`, push and open the PR

**Checkpoint**: All four CV routes are live and linked to each other. Every page meets the cross-cutting criteria.

---

## Phase 4: User Story 3: visual baselines (Priority: P3) (CV4)

**Goal**: Every CV page and the 404 page are held to owner-approved images at 390px and 1280px (FR-013, AC-50, AC-51).

**Independent Test**: `npx playwright test tests/acceptance/CV4/` (files and suite listing) and `npm run test:visual` (pixels, in Docker)

### Acceptance tests (test author, first commit, nothing before it) ⚠️ must be observed failing

- [ ] T032 [US3] (CV4) [A43] `test-author`: write failing acceptance tests for AC-50 (a) and (b) in `tests/acceptance/CV4/baselines.spec.ts`. For each of `cv`, `cv-engineering`, `cv-ocean`, `cv-life` and `404`, at 390 and 1280:
  - (a) the PNG exists under `tests/visual/__screenshots__/` and its header width matches;
  - (b) the output of `npx playwright test -c playwright.visual.config.ts --list` contains `<id> at <width>px matches its baseline`.

  Confirm the view and 404 cases fail. The `cv` cases may already pass after CV3; record that. Commit with `Gate-Test-Author: CV4` as the first commit on the branch.

### Implementation

- [ ] T033 [US3] (CV4) [A43][A44] Add `{ id: 'cv-engineering', path: '/cv/engineering/' }`, `{ id: 'cv-ocean', path: '/cv/ocean/' }`, `{ id: 'cv-life', path: '/cv/life/' }` and `{ id: '404', path: '/cv/foo/' }` to `PAGES` in `tests/visual/pages.spec.ts`. Confirm `/cv/` is still listed from CV3.
- [ ] T034 [US3] (CV4) [A43][A44][U35] Generate the new baselines in the Linux image with `npm run test:visual -- --update-snapshots`. Commit only the eight new `tests/visual/__screenshots__/{cv-engineering,cv-ocean,cv-life,404}-{390,1280}.png` files, and confirm with `git diff --stat` that the `index-*`, `fonts-*`, `cv-390.png` and `cv-1280.png` baselines are unchanged.
- [ ] T035 [US3] (CV4) [A44] **[Josh]** The owner reviews the eight new images in the PR against DESIGN.md (grid paper, islands, mono labels, italic headings, nothing overflowing at 390px) and approves them, or asks for changes in `src/styles/cv.css` followed by a regeneration (T034)
- [ ] T037 [US3] (CV4) Polish and cross-cutting: walk through [quickstart.md](quickstart.md) end to end and note the results in the CV4 PR description. The manual checks are the evidence for two success criteria with no automated test: SC-005 (full content with JavaScript disabled) and SC-007 (changing an entry's `views` in a scratch copy of the content file and rebuilding moves it between views). Also check reduced motion and the 390px width by eye.
- [ ] T045 [US3] (CV4) [A43][A44] Outer loop green: `npx playwright test tests/acceptance/CV4/` passes, and `npm run test:visual` passes in the Linux image
- [ ] T036 [US3] (CV4) [A44] Run `npm run test:visual` (AC-51) and `npm run gate -- task CV4` until both pass, commit `.gate/CV4/`, push and open the PR

**Checkpoint**: The visual regression suite covers every CV page and the 404 page.

---

## Dependencies & Execution Order

### Phase dependencies

- **Design-first phase** (outside this task list): approved `/cv/` look plus `cv-390.png` and `cv-1280.png` before CV3 (T030). CV2 can use its CSS if it has landed. See plan §Dependencies.
- **Phase 1 (CV1)**: test-author first (T002), then the module. One PR.
- **Phase 2 (CV2)** depends on CV1 being merged.
- **Phase 3 (CV3)** depends on CV2 being merged (view links, AC-22; shared layout and components).
- **Phase 4 (CV4)**, including the polish task T037, depends on CV3 being merged.
- Strictly sequential gate tasks: CV1 → CV2 → CV3 → CV4. Each branches from `main` after the previous merge.

### Within a gate task

- The test-author task (T002, T014, T026, T032) is always first, is its own commit, and nothing precedes it.
- Inner unit test before implementation: T003→T004, T005→T006, T007→T008, T009→T010, T011→T012, T038→T039, T040→T041.
- Components before the pages that use them: T016–T019 → T020 → T021 → T022.
- The outer-loop-green task (T042, T043, T044, T045) comes just before its gate run, and the gate run is always last.
- Task ids are stable, not positional. T001 was folded into T004 in fix round 1, so the series starts at T002. T038–T045 were added by `/speckit-tdd-plan` and sit where they run.

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
