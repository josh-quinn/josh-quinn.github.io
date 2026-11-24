# Implementation Plan: CV pages

**Branch**: `001-cv-page` (planned on `slice/08-cv-spec`; built on `task/<id>-<slug>` branches) | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-cv-page/spec.md`

## Summary

Four static CV pages (`/cv/` and three views) and a site 404 page, rendered at build time from `src/content/resume.json`. A pure view-selection module (`src/lib/cv.ts`) decides which entries go on which page. Astro pages and small components render the result with the existing design tokens and CSS motion, and ship no JavaScript. The work is delivered as four gate tasks (CV1 to CV4). Each is one PR with its own failing acceptance tests written first from the spec. The `/cv/` look and its baselines come from the design-first phase that runs before CV1.

## Technical Context

**Language/Version**: TypeScript 6 (strict, `tsconfig.json`), Astro 7.4 components, Node ≥ 24

**Primary Dependencies**: Astro 7.4 (static output). No new runtime or dev dependency.

**Storage**: N/A. A single JSON file read at build time.

**Testing**: Playwright 1.65 test runner for acceptance (browser checks against `astro preview` on port 4321, and module checks without a page), `@axe-core/playwright` 4.14 for AC-33, Vitest 5 for inner unit tests (`tests/unit/cv/`), and the Linux Playwright image (`npm run test:visual`) for visual baselines.

**Target Platform**: GitHub Pages (static files, `404.html` fallback), evergreen browsers, from 390px wide.

**Project Type**: Static website (single project).

**Performance Goals**: No client JS. Each CV page is a single HTML document plus the shared CSS and self-hosted fonts already used by the home page. No new network requests.

**Constraints**: Constitution III (privacy) and IV (tokens only, no framework, no client JS). DESIGN.md (one 34–36rem column, islands at most two per page, CSS-only motion gated on `prefers-reduced-motion: no-preference`). No horizontal overflow at 390px.

**Scale/Scope**: 5 built pages, 8 sections, about 30 entries of placeholder content.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Tests first, from the spec | Every gate task starts with a `Gate-Test-Author: <id>` commit of `tests/acceptance/<id>/` written from `spec.md` only. The spec carries the module and page contracts the test author needs (spec §View-Selection Contract, §Page Structure Contract). The TDD test list (`tdd/test-list.md`) traces each behaviour to an AC. | Pass |
| II. Implementer never edits acceptance tests | Implementation tasks touch `src/`, `tests/unit/cv/` and `tests/visual/` only. A wrong acceptance test goes back to the test author. | Pass |
| III. Privacy | Only allowed profiles are linked (FR-006, AC-35). Location is the region only. No dates are shown (FR-003). Privacy patterns run per route (AC-30). All content stays fictional placeholder content. | Pass |
| IV. Design rules | Tokens only (`src/styles/cv.css`, stylelint). No framework. No client JS (AC-31). No brand marks. | Pass |
| V. Tooling and process | No new tool, so no ADR is needed. Conventional commits. One gate task is one PR. Claude Code and Copilot routes are the existing role agents. | Pass |
| VI. Definition of done | Each gate task is done when `npm run gate -- task <id>` passes and the owner merges. | Pass |

Post-design re-check (after Phase 1): unchanged. All pass. There are no violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-cv-page/
├── spec.md              # feature spec, acceptance criteria, delivery slices
├── plan.md              # this file
├── research.md          # Phase 0 decisions
├── data-model.md        # content entities and selection rules
├── quickstart.md        # how to validate
├── contracts/
│   ├── view-selection.md  # src/lib/cv.ts public surface
│   └── pages.md           # routes and page outlines
├── checklists/
│   ├── requirements.md    # spec quality (specify/clarify)
│   └── acceptance.md      # acceptance-criteria quality (reviewer-owned)
├── tasks.md             # /speckit-tasks output
├── gate-tasks.md        # gate-task id → tasks, ACs, test folder
└── tdd/
    └── test-list.md     # /speckit-tdd-plan output
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── cv.ts                    # CV1: VIEWS, SECTION_ORDER, isView, entryTitle, sectionsForView,
│                                #      overviewSections, VIEW_TITLES, SECTION_HEADINGS, viewPath, allowedProfiles;
│                                # CV2 adds entryDetails and showPlaceholder (page logic kept unit-testable)
├── layouts/
│   ├── Base.astro               # existing (unchanged, or a backwards-compatible prop at most)
│   └── Cv.astro                 # CV2: CV page shell (Base + cv.css + placeholder notice + header slot)
├── components/
│   └── cv/
│       ├── PlaceholderNotice.astro  # CV2: data-cv-placeholder
│       ├── ViewNav.astro            # CV2: nav[aria-label="CV views"]
│       ├── ProfileLinks.astro       # CV2: allowed profiles
│       ├── CvSection.astro          # CV2: section[data-cv-section] + h2
│       └── CvEntry.astro            # CV2: [data-cv-entry] + h3 + shown fields
├── pages/
│   ├── 404.astro                # CV2: site 404
│   └── cv/
│       ├── [view].astro         # CV2: getStaticPaths over VIEWS
│       └── index.astro          # CV3: overview
└── styles/
    └── cv.css                   # design phase / CV2: CV-specific rules, tokens only

tests/
├── acceptance/CV1..CV4/         # test author only (edit-guarded)
├── unit/cv/                     # implementer's inner TDD tests (Vitest)
└── visual/pages.spec.ts         # CV3 adds /cv/, CV4 adds the views and 404; baselines in __screenshots__/
```

**Structure Decision**: single static Astro project, extending the existing `src/` layout (`layouts/`, `pages/`, `styles/`) with `src/lib/` for pure logic and `src/components/cv/` for CV parts. No new top-level directories.

## Gate tasks (delivery)

Four gate tasks, in this order. Each is one branch `task/<id>-<slug>`, one PR and one `npm run gate -- task <id>` verdict. The details (task ids, ACs, test folders) are in [gate-tasks.md](gate-tasks.md).

| Order | Id | Branch | Scope |
|---|---|---|---|
| 1 | `CV1` | `task/CV1-view-selection` | `src/lib/cv.ts` and its inner unit tests |
| 2 | `CV2` | `task/CV2-view-pages` | CV layout, components, `/cv/<view>/` pages, site 404 |
| 3 | `CV3` | `task/CV3-overview` | `/cv/`, the `CV overview` back-links on the views, `/cv/` in the visual suite |
| 4 | `CV4` | `task/CV4-visual-baselines` | owner-approved baselines for the views and the 404 page, all CV pages in the visual suite |

This deviates from the suggested CV2-overview / CV3-views split, because the gate's offline link check runs on every task (research R9). Views come first: they link only to each other and to the profiles. The overview, which links to the views, lands after them, together with the views' back-link to it.

## Dependencies and handoffs

- **Design-first phase (before CV1, not a gate task here)**: produces the approved `/cv/` look (`npm run gate -- design cv` passing, owner approval) and the baselines `tests/visual/__screenshots__/cv-390.png` and `cv-1280.png`. What lands on `main` from that phase must keep every gate check green for CV1 and CV2. Recommended: merge the shared CSS (`src/styles/cv.css`, tokens only) and the two baseline images. Do not merge a routed `/cv/` prototype that links to unbuilt view routes, because lychee would fail. Do not add `/cv/` to `tests/visual/pages.spec.ts` before a data-driven `/cv/` exists; CV3 does that. The prototype should already use the spec's Page Structure Contract (hooks, texts, order), so CV3 can match its pixels. If a prototype page does land on `main`, CV3 replaces it, and AC-24 fails until any hard-coded content is gone.
- **CV2 → CV1**: pages call `sectionsForView` and the other exports.
- **CV3 → CV2**: the overview links to the views (AC-22 follows those links) and reuses the CV layout and components.
- **CV4 → CV2, CV3**: baselines of the finished pages. The owner approves the images in the CV4 PR before merge.
- **Visual baselines are gate-verified**: AC-51 is checked by the gate's `visual` check in Docker, not by host acceptance tests (research R6). CV3's gate run already compares `/cv/` with the design-phase baselines.

## Risks

- The design critic in task mode scores only the home page, and has no page id for nested view routes (research R12). Design conformance of the views rests on AC-38, the visual baselines and owner review.
- If the design-phase look for `/cv/` differs from the spec's Page Structure Contract, CV3 must either match the pixels or have new baselines approved. The owner decides.
- `astro preview`'s 404 handling is internal Astro behaviour (research R2). If an Astro upgrade changes it, AC-19 catches it.

## Complexity Tracking

No constitution violations. Nothing to justify.
